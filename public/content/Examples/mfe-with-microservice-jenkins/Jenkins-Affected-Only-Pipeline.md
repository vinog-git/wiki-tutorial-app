# Jenkins — An Affected-Only Pipeline

A Jenkins job that runs the same affected-only deploy, auto-configured
at container build time so there is nothing to click through on first boot.

The interesting part is the loop it enables: **edit a file, hit build, watch one
container get replaced** — with no commit, no push, and no full-stack restart.

## The Jenkins image

`docker/jenkins/Dockerfile` starts from `jenkins/jenkins:lts-jdk21` and adds the
docker CLI plus the compose plugin (to drive the host daemon over the mounted
socket) and Node (so it can ask Nx what is affected).

Four things that will each cost you a build cycle if you miss them:

### 1. Plugins go in a file, not on the command line

```dockerfile
COPY docker/jenkins/plugins.txt /usr/share/jenkins/ref/plugins.txt
RUN jenkins-plugin-cli --plugin-file /usr/share/jenkins/ref/plugins.txt
```

A quoted multi-line `--plugins "a \ b \ c"` argument collapses into one string
with runs of whitespace. The CLI reads those gaps as empty plugin names and 404s
on `https://updates.jenkins.io/latest/.hpi` — note the missing name before
`.hpi`, which is the giveaway.

```
configuration-as-code
job-dsl
workflow-aggregator
git
ws-cleanup
timestamper
ansicolor
build-timeout
```

Note there is no Docker *plugin* in that list. The pipeline shells out to the
`docker` CLI installed in the image (`docker-ce-cli`, `docker-buildx-plugin`,
`docker-compose-plugin` from Docker's apt repo), which is simpler than routing
compose through a Jenkins plugin.

### 2. `casc.yaml` must not live under `/var/jenkins_home`

That path is a **named volume at runtime**, and the mount hides anything baked
into the image at that location. Configuration as Code then silently does
nothing — Jenkins boots clean with no job and no error explaining why.

```dockerfile
COPY docker/jenkins/casc.yaml /usr/share/jenkins/casc/casc.yaml
ENV CASC_JENKINS_CONFIG=/usr/share/jenkins/casc/casc.yaml
```

### 3. Allow local git checkouts

The job reads its Jenkinsfile from the repo mounted at `/workspace`, and the git
plugin refuses local-path remotes by default:

```
Checkout of Git remote '/workspace' aborted because it references a local directory
```

```dockerfile
ENV JAVA_OPTS="-Djenkins.install.runSetupWizard=false \
               -Dhudson.model.DownloadService.noSignatureCheck=true \
               -Dhudson.plugins.git.GitSCM.ALLOW_LOCAL_CHECKOUT=true"
```

### 4. Mark the workspace a safe directory

Jenkins runs as root here and `/workspace` is owned by your user, so git calls
it "dubious ownership" and refuses to read it:

```dockerfile
RUN git config --global --add safe.directory '*'
```

## The job is created by Configuration as Code

`casc.yaml` defines the `microshop-deploy-affected` job, reading `Jenkinsfile`
from `/workspace` over git. The pipeline body then runs inside
`dir('/workspace')` — so the **definition** is versioned in git, but the
**build** sees your live working tree, uncommitted edits included.

That split is deliberate. It is what makes the edit-and-build loop work without
forcing a commit for every experiment.

## The pipeline

```groovy
pipeline {
  agent any

  options {
    timestamps()
    ansiColor('xterm')
    timeout(time: 45, unit: 'MINUTES')
    disableConcurrentBuilds()
  }

  parameters {
    choice(
      name: 'MODE',
      choices: ['auto', 'since-last-deploy', 'all'],
      description: 'auto = uncommitted edits if any, else since the last green deploy.'
    )
    booleanParam(
      name: 'DRY_RUN',
      defaultValue: false,
      description: 'Report what would be deployed without touching the running stack.'
    )
  }

  environment {
    WORKSPACE_DIR        = '/workspace'
    COMPOSE_PROJECT_NAME = 'microshop'
    NPM_CONFIG_CACHE     = '/tmp/.npm'
  }

  stages {
    stage('Preflight') { /* docker + node + compose reachable */ }

    stage('Work out what is affected') {
      steps {
        dir(env.WORKSPACE_DIR) {
          script {
            def raw = sh(script: "./tools/scripts/affected.sh ${params.MODE} 2>/dev/null",
                         returnStdout: true).trim()
            env.AFFECTED = raw.replaceAll('\n', ' ').trim()
            def list = env.AFFECTED ? (env.AFFECTED.split(/\s+/) as List) : []
            currentBuild.description = list.isEmpty()
              ? "nothing affected (${params.MODE})"
              : "${params.DRY_RUN ? '[dry-run] ' : ''}${list.join(', ')}"
          }
        }
      }
    }

    stage('Build & deploy affected') {
      when {
        allOf {
          expression { return env.AFFECTED?.trim() }
          expression { return !params.DRY_RUN }
        }
      }
      steps {
        dir(env.WORKSPACE_DIR) {
          script {
            def failures = []
            // Sequential on purpose: these all drive the same docker daemon and
            // the same compose project, and interleaved output helps nobody.
            env.AFFECTED.split(/\s+/).each { project ->
              try {
                sh "npx nx run ${project}:deploy --skip-nx-cache"
              } catch (err) {
                failures << project
                echo "  x ${project} failed: ${err.message}"
              }
            }
            if (failures) { error("Failed to deploy: ${failures.join(', ')}") }
          }
        }
      }
    }

    stage('Verify through the gateway') { /* smoke check, below */ }
  }
}
```

`disableConcurrentBuilds()` is not optional. Two builds racing to run
`docker compose up` against the same project will interleave container
recreation and leave the stack in a state neither build expects.

Note the deploy loop calls `nx run <project>:deploy` rather than a compose
command. Each project's own `deploy` target knows which compose service it maps
to, so the pipeline never has to hold that mapping.

## The smoke check

After deploying, the pipeline hits every route through the gateway:

```bash
for path in /gateway-health /api/users /api/products /api/purchases \
            /mfe/users/remoteEntry.mjs /mfe/products/remoteEntry.mjs \
            /mfe/purchases/remoteEntry.mjs / ; do
  # 127.0.0.1, not localhost: inside the container localhost
  # resolves to ::1 first and nginx only binds IPv4.
  code=$(docker compose exec -T gateway \
           wget -q -O /dev/null -S "http://127.0.0.1${path}" 2>&1 \
         | awk '/HTTP\//{c=$2} END{print c}')
  printf "  %-38s %s\n" "${path}" "${code:-unreachable}"
  case "${code}" in 2*|3*) ;; *) fail=1 ;; esac
done
```

It checks the whole surface, not just the thing that was deployed. A partial
deploy that breaks an unrelated route is exactly the failure worth catching.

## The feedback you get

**In the build list** — the description is the deployed project list, so history
is readable at a glance:

> Output on this page is **illustrative** — representative of real pipeline runs, not captured from one.

```output
#7   users, shell
#6   [dry-run] products, shell
#5   user-service
#4   nothing affected (auto)
```

**In the console** — per project, from `deploy-project.sh`:

```output
──────────────────────────────────────────────────────────────
 deploying: users-mfe
──────────────────────────────────────────────────────────────
  1/3  building image
  2/3  replacing container (--no-deps: nothing else is touched)
  3/3  waiting for it to become healthy
  ✓ users-mfe deployed in 47s  (image sha256:1f3c9e0a4b)
```

**At the end** — a summary naming what shipped:

```output
=================== SUCCESS ===================
  deployed : users shell
  mode     : auto
  app      : http://localhost:8080
===============================================
```

A failure is explicit that the blast radius was contained:

```output
=================== FAILED ====================
  attempted : users shell

  The rest of the stack was left running - only the projects listed
  above were touched. Check the stage log for the container's tail.
===============================================
```

On success the pipeline writes `git rev-parse HEAD` into `.nx-last-deploy-sha`,
which is the baseline the `since-last-deploy` mode compares against next time.

## Triggering it without the UI

```bash
# kick a build
curl -X POST http://admin:admin@localhost:8090/job/microshop-deploy-affected/build

# with parameters
curl -X POST 'http://admin:admin@localhost:8090/job/microshop-deploy-affected/buildWithParameters?MODE=all&DRY_RUN=true'
```

> **One wart to know about.** A parameterised pipeline's `parameters {}` block
> only registers **after its first run**. Until then `buildWithParameters`
> returns `400`. Trigger plain `/build` once first, and everything after that
> works.

## The loop this gives you

```bash
vim apps/users/src/app/remote-entry/entry.ts     # edit, don't commit
curl -X POST http://admin:admin@localhost:8090/job/microshop-deploy-affected/build
# → build #8: "users, shell" — two containers replaced, eight untouched
```
