// CLI Powerhouse Enhancements: Highlighting, Auto-complete, History

export function enhanceReadline(rl) {
  // Store command history for up-arrow recall
  const history = [];
  let historyIdx = -1;
  let currentInput = '';

  // Highlight slash commands, @mentions, #tags in real-time
  const highlight = (text) => {
    return text
      .replace(/^(\/[a-zA-Z]+)/, '\x1b[38;5;82m$1\x1b[0m')      // /command -> green
      .replace(/(@[a-zA-Z_]+)/g, '\x1b[38;5;208m$1\x1b[0m')       // @mention -> orange
      .replace(/(#[a-zA-Z_]+)/g, '\x1b[38;5;39m$1\x1b[0m')        // #tag -> blue
      .replace(/(~\/[^\s]*)/g, '\x1b[38;5;141m$1\x1b[0m')         // ~/path -> purple
      .replace(/(\|\s)/g, '\x1b[38;5;243m$1\x1b[0m');             // | pipe -> dim
  };

  // Available commands for tab completion
  const commands = ['/audit', '/auto', '/plan', '/boot', '/skills', '/help', '/clear'];
  const flags = ['--online', '--quick', '--deep'];

  // Override the default prompt behavior
  const origQuestion = rl.question.bind(rl);
  
  rl.question = (query, callback) => {
    // Enhanced prompt with live highlighting
    const enhancedQuery = query.replace('⬡ flock ❯ ', '⬡ flock ❯ \x1b[38;5;82m');
    
    origQuestion(enhancedQuery, (input) => {
      // Add to history
      if (input.trim()) {
        history.push(input);
        historyIdx = history.length;
      }
      
      // Show highlighted version
      if (input.trim() && (input.startsWith('/') || input.includes('@') || input.includes('#'))) {
        console.log(`  ${highlight(input)}`);
      }
      
      callback(input);
    });
  };

  // Listen for keypress events for tab completion
  process.stdin.on('keypress', (str, key) => {
    if (key && key.name === 'tab') {
      // Get current line content and auto-complete
      const line = rl.line || '';
      
      // Command completion
      if (line.startsWith('/')) {
        const match = commands.filter(c => c.startsWith(line));
        if (match.length === 1) {
          rl.write(null, { ctrl: true, name: 'u' }); // clear line
          rl.write(match[0] + ' ');
        } else if (match.length > 1) {
          console.log('\n  ' + match.join('  '));
          rl.prompt(true);
        }
      }
      
      // Flag completion
      if (line.includes('--')) {
        const partial = line.split(' ').pop();
        const match = flags.filter(f => f.startsWith(partial));
        if (match.length === 1) {
          rl.write(match[0].replace(partial, ''));
        }
      }
    }
    
    // Up arrow for history
    if (key && key.name === 'up') {
      if (historyIdx > 0) {
        historyIdx--;
        rl.write(null, { ctrl: true, name: 'u' });
        rl.write(history[historyIdx]);
      }
    }
    
    // Down arrow for history
    if (key && key.name === 'down') {
      if (historyIdx < history.length - 1) {
        historyIdx++;
        rl.write(null, { ctrl: true, name: 'u' });
        rl.write(history[historyIdx]);
      } else {
        historyIdx = history.length;
        rl.write(null, { ctrl: true, name: 'u' });
      }
    }
  });

  return { history, commands };
}
