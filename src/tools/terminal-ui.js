import readline from 'readline';

/**
 * High-fidelity terminal visual feedback system
 */
export class TerminalUI {
  constructor() {
    this.spinnerIdx = 0;
    this.interval = null;
    this.icons = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    this.colors = {
      reset: '\x1b[0m',
      green: '\x1b[38;5;82m',
      orange: '\x1b[38;5;208m',
      blue: '\x1b[38;5;39m',
      dim: '\x1b[38;5;243m',
      yellow: '\x1b[38;5;226m'
    };
  }

  /**
   * Start a multi-stage spinner
   * @param {string} label - The text to display next to the spinner
   */
  start(label = 'Processing') {
    if (this.interval) clearInterval(this.interval);
    
    process.stdout.write(`\n`);
    this.interval = setInterval(() => {
      const icon = this.icons[this.spinnerIdx % this.icons.length];
      const color = this._getBlinkingColor();
      process.stdout.write(`\r  ${color}${icon}${this.colors.reset}  ${this.colors.dim}${label}...${this.colors.reset} `);
      this.spinnerIdx++;
    }, 80);
  }

  /**
   * Transition the spinner to a new stage
   * @param {string} newLabel - The new text to display
   */
  step(newLabel) {
    // Brief flicker to indicate transition
    process.stdout.write(`\r  ${this.colors.yellow}●${this.colors.reset}  ${this.colors.dim}${newLabel}...${this.colors.reset} `);
  }

  /**
   * Stop the spinner with a success message
   */
  stop(finalLabel = 'Done') {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
    process.stdout.write(`\r  ${this.colors.green}✓${this.colors.reset}  ${this.colors.green}${finalLabel}${this.colors.reset}\n\n`);
  }

  /**
   * Stop the spinner with an error message
   */
  error(errLabel = 'Failed') {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
    process.stdout.write(`\r  \x1b[31m✕\x1b[0m  \x1b[31m${errLabel}\x1b[0m\n\n`);
  }

  _getBlinkingColor() {
    // Cycle through colors for a "pulsing" effect
    const cycle = [this.colors.green, this.colors.blue, this.colors.orange];
    return cycle[Math.floor(this.spinnerIdx / 5) % cycle.length];
  }
}

export const ui = new TerminalUI();
