# Webhook Signature Verification

Mission Control signs all webhook payloads with HMAC-SHA256 using your webhook secret.

## Headers Sent

| Header | Description |
|--------|-------------|
| `X-MC-Signature` | HMAC-SHA256 signature (hex encoded) |
| `X-MC-Timestamp` | Unix timestamp (ms) when event was dispatched |
| `X-MC-Event` | Event type (e.g., `task_created`) |
| `X-MC-Delivery` | Unique delivery ID for this attempt |

## Payload Structure

```json
{
  "event": "task_created",
  "timestamp": "2026-02-03T02:00:00.000Z",
  "data": {
    "task_id": "abc123...",
    "title": "Example Task",
    ...
  }
}
```

## Supported Events

- `task_created` - New task created
- `task_updated` - Task fields updated (not status)
- `task_status_changed` - Task status changed
- `task_assigned` - Agent assigned to task
- `message_sent` - New message/comment on task
- `agent_mentioned` - Agent @mentioned in message

## Verification Examples

### Node.js

```javascript
const crypto = require('crypto');

function verifyWebhookSignature(payload, signature, secret) {
  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  
  // Timing-safe comparison
  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expectedSig, 'hex')
  );
}

// Express middleware
app.post('/webhook', (req, res) => {
  const payload = JSON.stringify(req.body);
  const signature = req.headers['x-mc-signature'];
  const secret = process.env.WEBHOOK_SECRET;
  
  if (!verifyWebhookSignature(payload, signature, secret)) {
    return res.status(401).send('Invalid signature');
  }
  
  // Process event
  const { event, data } = req.body;
  console.log(`Received ${event}:`, data);
  
  res.status(200).send('OK');
});
```

### Python

```python
import hmac
import hashlib
from flask import Flask, request, abort

app = Flask(__name__)
WEBHOOK_SECRET = 'your-webhook-secret'

def verify_signature(payload: bytes, signature: str, secret: str) -> bool:
    expected = hmac.new(
        secret.encode(),
        payload,
        hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(signature, expected)

@app.route('/webhook', methods=['POST'])
def handle_webhook():
    payload = request.get_data()
    signature = request.headers.get('X-MC-Signature', '')
    
    if not verify_signature(payload, signature, WEBHOOK_SECRET):
        abort(401, 'Invalid signature')
    
    data = request.get_json()
    print(f"Received {data['event']}: {data['data']}")
    
    return 'OK', 200
```

### Cloudflare Worker

```typescript
export default {
  async fetch(request: Request, env: { WEBHOOK_SECRET: string }) {
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }
    
    const payload = await request.text();
    const signature = request.headers.get('X-MC-Signature') || '';
    
    // Verify signature
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(env.WEBHOOK_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const signatureBuffer = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(payload)
    );
    
    const expectedSig = Array.from(new Uint8Array(signatureBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    if (signature !== expectedSig) {
      return new Response('Invalid signature', { status: 401 });
    }
    
    // Process event
    const { event, data } = JSON.parse(payload);
    console.log(`Received ${event}:`, data);
    
    return new Response('OK', { status: 200 });
  }
};
```

## Retry Policy

Failed deliveries are retried with exponential backoff:
- Attempt 1: immediate
- Attempt 2: ~1 minute
- Attempt 3: ~2 minutes
- Attempt 4: ~4 minutes
- ... up to max 1 hour delay

After 5 failed attempts, delivery is marked as failed.

## Testing Webhooks

Use the test endpoint to send a sample event:

```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_TOKEN" \
  https://mc-v3-api.saurabh-198.workers.dev/api/webhooks/{id}/test
```

This sends a `test.ping` event with sample data to verify your endpoint works.
