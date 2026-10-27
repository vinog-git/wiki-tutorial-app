# Angular: Building a Reusable Progress Bar Component

## What We're Building

A standalone Angular component that displays a visual progress bar with automatic color coding, status messages, optional animations, and full configurability via `@Input` properties.

## The Full Component

Create `progress-bar.component.ts`:

```typescript
import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-progress-bar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="progress-container">
      @if (label) {
        <div class="progress-header">
          <span class="progress-label">{{ label }}</span>
          <span class="progress-percentage">{{ value }}%</span>
        </div>
      }

      <div class="progress-track">
        <div 
          class="progress-bar"
          [ngStyle]="{ 'width': value + '%' }"
          [ngClass]="progressBarClasses">
          @if (value >= 30 && showLabel) {
            <span class="progress-text">{{ value }}%</span>
          }
        </div>
      </div>

      @if (showStatus) {
        <div class="progress-status" [ngClass]="statusClass">
          @switch (statusType) {
            @case ('success') { <span>✓ Complete</span> }
            @case ('warning') { <span>⚠ In Progress</span> }
            @case ('error') { <span>✗ Error</span> }
            @default { <span>{{ statusMessage }}</span> }
          }
        </div>
      }

      @if (debug) {
        <div class="progress-debug">
          Value: {{ value }}, Max: {{ max }}, Status: {{ statusType }}
        </div>
      }
    </div>
  `,
  styles: [`
    .progress-container { width: 100%; margin: 20px 0; }

    .progress-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }

    .progress-label { font-weight: 600; font-size: 14px; color: #333; }
    .progress-percentage { font-size: 14px; font-weight: bold; color: #666; }

    .progress-track {
      width: 100%;
      height: 24px;
      background-color: #e0e0e0;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.1);
    }

    .progress-bar {
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: bold;
      font-size: 12px;
      transition: width 0.3s ease, background-color 0.3s ease;
    }

    .progress-bar.empty    { background-color: #e0e0e0; }
    .progress-bar.low      { background: linear-gradient(90deg, #ff6b6b, #ff8787); }
    .progress-bar.medium   { background: linear-gradient(90deg, #ffd93d, #ffed4e); color: #333; }
    .progress-bar.high     { background: linear-gradient(90deg, #51cf66, #69db7c); }
    .progress-bar.complete { background: linear-gradient(90deg, #339af0, #4dabf7); }

    .progress-status { margin-top: 8px; font-size: 12px; font-weight: 500; }
    .status-success { color: #51cf66; }
    .status-warning { color: #ffd93d; }
    .status-error   { color: #ff6b6b; }
    .status-info    { color: #339af0; }

    .progress-bar.striped {
      background-image: repeating-linear-gradient(
        45deg,
        transparent,
        transparent 10px,
        rgba(255, 255, 255, 0.2) 10px,
        rgba(255, 255, 255, 0.2) 20px
      );
    }

    @keyframes shimmer {
      0%   { background-position: -1000px 0; }
      100% { background-position:  1000px 0; }
    }

    .progress-bar.shimmer {
      animation: shimmer 2s infinite;
      background-size: 1000px 100%;
    }

    .progress-debug {
      margin-top: 8px;
      padding: 8px;
      background-color: #f5f5f5;
      border-radius: 4px;
      font-size: 11px;
      color: #666;
      font-family: monospace;
    }

    @media (max-width: 480px) {
      .progress-track { height: 20px; }
    }
  `]
})
export class ProgressBarComponent implements OnInit {
  @Input() value: number = 0;
  @Input() max: number = 100;
  @Input() label: string = '';
  @Input() showLabel: boolean = true;
  @Input() showStatus: boolean = true;
  @Input() statusMessage: string = '';
  @Input() animated: boolean = false;
  @Input() striped: boolean = false;
  @Input() debug: boolean = false;

  statusType: 'success' | 'warning' | 'error' | 'info' = 'info';
  statusClass: string = '';

  ngOnInit() { this.updateStatus(); }
  ngOnChanges() { this.updateStatus(); }

  private updateStatus() {
    if (this.value > this.max) this.value = this.max;
    if (this.value < 0) this.value = 0;

    if (this.value === this.max)  this.statusType = 'success';
    else if (this.value >= 75)    this.statusType = 'warning';
    else if (this.value < 25)     this.statusType = 'error';
    else                          this.statusType = 'info';

    this.statusClass = `status-${this.statusType}`;
  }

  get progressBarClasses() {
    const classes: { [key: string]: boolean } = {};

    if (this.value === 0)        classes['empty']    = true;
    else if (this.value < 33)    classes['low']      = true;
    else if (this.value < 67)    classes['medium']   = true;
    else if (this.value < 100)   classes['high']     = true;
    else                         classes['complete'] = true;

    if (this.animated) classes['shimmer'] = true;
    if (this.striped)  classes['striped'] = true;

    return classes;
  }
}
```

## @Input Properties

| Property | Type | Default | Description |
|---|---|---|---|
| `value` | `number` | `0` | Current progress (0–100, or 0–max) |
| `max` | `number` | `100` | Maximum value |
| `label` | `string` | `''` | Label shown above the bar |
| `showLabel` | `boolean` | `true` | Show % inside bar when value ≥ 30 |
| `showStatus` | `boolean` | `true` | Show status message below bar |
| `statusMessage` | `string` | `''` | Custom status text (used when statusType is default) |
| `animated` | `boolean` | `false` | Shimmer animation effect |
| `striped` | `boolean` | `false` | Diagonal stripe overlay |
| `debug` | `boolean` | `false` | Show debug info panel |

## Automatic Color Coding

The bar color updates automatically based on the current value — no extra code needed.

| Range | Color | CSS Class |
|---|---|---|
| 0% | Gray | `empty` |
| 1–32% | Red | `low` |
| 33–66% | Yellow | `medium` |
| 67–99% | Green | `high` |
| 100% | Blue | `complete` |

Status message color follows a similar scale:

| Range | Status type | Color |
|---|---|---|
| 0–24% | error | Red |
| 25–74% | info | Blue |
| 75–99% | warning | Orange |
| 100% | success | Green |

## Basic Usage

Import the component and drop it into any standalone component:

```typescript
@Component({
  selector: 'app-example',
  standalone: true,
  imports: [ProgressBarComponent],
  template: `
    <!-- Simplest form -->
    <app-progress-bar [value]="50"></app-progress-bar>

    <!-- With label -->
    <app-progress-bar [value]="75" label="Downloading..."></app-progress-bar>

    <!-- Custom max value (e.g. 30 out of 150 steps) -->
    <app-progress-bar [value]="30" [max]="150" label="Processing"></app-progress-bar>
  `
})
export class ExampleComponent {}
```

#### Output

The three usages above render as:

```output
<app-progress-bar [value]="50">
┌────────────────────────────────────────┐
│██████████████████████                  │  50% (yellow — medium)
└────────────────────────────────────────┘
  Custom status message

<app-progress-bar [value]="75" label="Downloading...">
  Downloading...                      75%
┌────────────────────────────────────────┐
│██████████████████████████████████      │  75% (green — high)
└────────────────────────────────────────┘
  ⚠ In Progress

<app-progress-bar [value]="30" [max]="150" label="Processing">
  Processing                          30%
┌────────────────────────────────────────┐
│████████████                            │  30% (red — low)
└────────────────────────────────────────┘
```

The third one exposes a real bug worth noticing: with `[max]="150"`, 30 out of 150 is **20%**, but the bar is drawn at 30% and the header reads `30%`. The template uses `value + '%'` directly and never divides by `max`:

```html
[ngStyle]="{ 'width': value + '%' }"     <!-- ignores max -->
```

The fix is a computed percentage:

```typescript
get percent(): number { return (this.value / this.max) * 100; }
```

```html
[ngStyle]="{ 'width': percent + '%' }"
<span class="progress-percentage">{{ percent | number:'1.0-0' }}%</span>
```

Also note the `@if (value >= 30 && showLabel)` guard on the inner text: below 30% the bar is too narrow to hold the label legibly, so it is omitted entirely rather than overflowing:

```output
<app-progress-bar [value]="10">
┌────────────────────────────────────────┐
│████                                    │  (no text inside the bar)
└────────────────────────────────────────┘
  ✗ Error
```

## File Upload Example

Simulates an upload with a slider control and an animated progress bar:

```typescript
@Component({
  selector: 'app-file-upload',
  standalone: true,
  imports: [ProgressBarComponent, FormsModule],
  template: `
    <app-progress-bar 
      [value]="uploadProgress"
      label="Uploading document.pdf"
      [showStatus]="true">
    </app-progress-bar>

    <input type="range" min="0" max="100" [(ngModel)]="uploadProgress">
    <button (click)="startUpload()">Start Upload</button>
  `,
  styles: [`
    button {
      padding: 10px 20px;
      background-color: #007bff;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    }
    button:hover { background-color: #0056b3; }
  `]
})
export class FileUploadComponent {
  uploadProgress = 0;

  startUpload() {
    this.uploadProgress = 0;
    const interval = setInterval(() => {
      this.uploadProgress += Math.random() * 25;
      if (this.uploadProgress >= 100) {
        this.uploadProgress = 100;
        clearInterval(interval);
      }
    }, 400);
  }
}
```

## Multiple Progress Bars (Task Monitor)

Use `@for` to render one bar per task:

```typescript
@Component({
  selector: 'app-task-monitor',
  standalone: true,
  imports: [ProgressBarComponent, CommonModule],
  template: `
    <h2>Task Progress</h2>
    @for (task of tasks; track task.id) {
      <div style="margin-bottom: 20px;">
        <h3>{{ task.name }}</h3>
        <app-progress-bar 
          [value]="task.progress"
          [label]="task.name"
          [showLabel]="false"
          [showStatus]="true">
        </app-progress-bar>
      </div>
    }
  `
})
export class TaskMonitorComponent {
  tasks = [
    { id: 1, name: 'Download',  progress: 100 },
    { id: 2, name: 'Extract',   progress: 75  },
    { id: 3, name: 'Install',   progress: 45  },
    { id: 4, name: 'Configure', progress: 20  }
  ];
}
```

## Skill Level Display

Hide the status message and use the bar purely as a visual indicator:

```html
<div>
  <h3>Angular</h3>
  <app-progress-bar [value]="90" [showStatus]="false"></app-progress-bar>
</div>
<div>
  <h3>TypeScript</h3>
  <app-progress-bar [value]="85" [showStatus]="false"></app-progress-bar>
</div>
<div>
  <h3>CSS</h3>
  <app-progress-bar [value]="70" [showStatus]="false"></app-progress-bar>
</div>
```

## Animations

```html
<!-- Shimmer (moving highlight) — good for active operations -->
<app-progress-bar [value]="progress" label="Processing..." [animated]="true"></app-progress-bar>

<!-- Diagonal stripes -->
<app-progress-bar [value]="progress" label="Loading" [striped]="true"></app-progress-bar>
```

## Best Practices

✅ **DO:**
- Use `[value]="number"` (property binding) for reactive updates
- Set `[max]` when your scale is not 0–100
- Use `[animated]="true"` for actively running operations
- Always use `track` in `@for` loops: `@for (task of tasks; track task.id)`
- Set `[showLabel]="false"` when the bar is narrow (value < 30)

❌ **DON'T:**
- Use string values: `[value]="'50'"` — always bind numbers
- Set `value > 100` without adjusting `[max]`
- Use `[animated]` and `[striped]` together — performance impact
- Render more than ~50 progress bars on one page simultaneously
- Update `value` faster than 60fps
