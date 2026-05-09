import http from 'http';

export class Brain {
  constructor(model = 'deepseek-r1:1.5b') {
    this.model = model;
    this.host = '127.0.0.1';
    this.port = 11434;
  }

  async chat(messages, streamCallback) {
    const body = JSON.stringify({
      model: this.model,
      messages: messages,
      stream: false
    });

    return new Promise((resolve, reject) => {
      const req = http.request({
        hostname: this.host,
        port: this.port,
        path: '/api/chat',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        },
        timeout: 120000
      }, (res) => {
        let data = '';
        res.on('data', chunk => {
          data += chunk;
          // Try to stream partial content if possible
          try {
            const lines = data.split('\n').filter(l => l.trim());
            for (const line of lines) {
              const parsed = JSON.parse(line);
              if (parsed.message?.content && streamCallback) {
                streamCallback(parsed.message.content);
              }
            }
          } catch {}
        });
        
        res.on('end', () => {
          try {
            // Parse the full response
            const parsed = JSON.parse(data);
            resolve(parsed.message?.content || '');
          } catch {
            // Try parsing as NDJSON (streamed response)
            const lines = data.split('\n').filter(l => l.trim());
            let content = '';
            for (const line of lines) {
              try {
                const parsed = JSON.parse(line);
                content += parsed.message?.content || '';
              } catch {}
            }
            resolve(content);
          }
        });
      });

      req.on('error', (err) => {
        reject(new Error(`Ollama connection failed: ${err.message}. Is 'ollama serve' running?`));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timed out after 120s'));
      });

      req.write(body);
      req.end();
    });
  }
}
