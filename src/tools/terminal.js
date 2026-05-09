import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

export class Terminal {
  async execute(command) {
    try {
      const { stdout, stderr } = await execPromise(command);
      return {
        success: true,
        output: stdout.trim(),
        error: stderr.trim()
      };
    } catch (error) {
      return {
        success: false,
        output: error.stdout?.trim() || "",
        error: error.message || error.stderr?.trim()
      };
    }
  }
}
