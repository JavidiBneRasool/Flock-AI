import ollama from 'ollama';

export class Brain {
  constructor(model = 'deepseek-r1:1.5b') {
    this.model = model;
    this.maxRetries = 3;
    this.retryDelay = 2000;
  }

  async chat(messages, streamCallback) {
    let lastError = null;
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await this._doChat(messages, streamCallback);
      } catch (err) {
        lastError = err;
        const msg = err.message || '';
        
        // Only retry on connection errors, not model errors
        if (msg.includes('fetch failed') || msg.includes('ECONNREFUSED') || msg.includes('connect')) {
          if (attempt < this.maxRetries) {
            console.error(`  ⚠  Ollama unreachable (attempt ${attempt}/${this.maxRetries}), retrying...`);
            await this._sleep(this.retryDelay * attempt);
            continue;
          }
        } else {
          // Non-retryable error
          break;
        }
      }
    }
    
    throw new Error(`Ollama service not available after ${this.maxRetries} attempts: ${lastError?.message}`);
  }

  async _doChat(messages, streamCallback) {
    const response = await ollama.chat({
      model: this.model,
      messages: messages,
      stream: true,
      options: {
        timeout: 60000
      }
    });

    let fullContent = "";
    for await (const part of response) {
      if (part.message?.content) {
        const content = part.message.content;
        fullContent += content;
        if (streamCallback) streamCallback(content);
      }
    }
    return fullContent;
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
