# Job Queue System

Background job processing dengan support untuk retry, concurrency control, rate limiting, dan callbacks.

## Table of Contents

1. [Introduction](#introduction)
2. [Core Concepts](#core-concepts)
3. [Basic Usage](#basic-usage)
4. [Configuration](#configuration)
5. [Job Handlers](#job-handlers)
6. [Job States](#job-states)
7. [Callbacks & Hooks](#callbacks--hooks)
8. [Advanced Features](#advanced-features)
9. [Event Listeners](#event-listeners)
10. [Best Practices](#best-practices)
11. [Examples](#examples)

## Introduction

Job Queue adalah sistem untuk menjalankan tugas-tugas berat/panjang di background tanpa memblokir request HTTP. Cocok untuk:

- **Email sending** - Kirim email asynchronous
- **File processing** - Upload, convert, compress files
- **API calls** - Fetch data dari external API dengan retry
- **Data import** - Import data dalam batch
- **Notifications** - Send push notifications, SMS, dsb
- **Scheduled tasks** - Jalankan task di waktu tertentu

## Core Concepts

### Job

Unit kerja yang akan diproses oleh queue. Setiap job memiliki:

```typescript
interface Job<Data = any, Result = any> {
    id: string;                    // Unique job ID
    name: string;                  // Job type/name
    data: Data;                    // Job payload
    result?: Result;               // Job result (after completion)
    error?: { message: string };   // Error info (if failed)
    state: JobState;               // Current state
    attemptsMade: number;          // Retry count
    maxAttempts: number;           // Max retry attempts
    priority: number;              // Higher = process first
    createdAt: number;             // Creation timestamp
    runAt: number;                 // When to run (for delayed jobs)
    updatedAt: number;             // Last update timestamp
    metadata?: Record<string, any>; // Custom metadata
}
```

### JobQueue

Container untuk job dan handler processing logic.

```typescript
const queue = new JobQueue('email', {
    concurrency: 5,           // Max 5 jobs running simultaneously
    retry: { ... },           // Retry configuration
    limiter: { ... },         // Rate limiting
    hooks: { ... }            // Callback hooks
});
```

### Job States

```
waiting → active → completed
              ↓
         failed/delayed → active → completed
```

- **waiting**: Job siap dijalankan
- **delayed**: Job dijadwalkan untuk nanti
- **active**: Job sedang diproses
- **completed**: Job berhasil
- **failed**: Job gagal permanent
- **paused**: Queue dalam mode pause

## Basic Usage

### 1. Create Queue

```typescript
import { JobQueue } from './src/advanced/jobs/queue';

const emailQueue = new JobQueue('email', {
    concurrency: 2
});
```

### 2. Register Job Handler

```typescript
emailQueue.process('send-email', async (job) => {
    const { email, subject, message } = job.data;
    
    // Do work here
    const result = await sendEmail(email, subject, message);
    
    // Return result
    return result;
});
```

### 3. Add Job to Queue

```typescript
const job = await emailQueue.add('send-email', {
    email: 'user@example.com',
    subject: 'Welcome!',
    message: 'Thanks for signing up'
});

console.log(job.id); // jobId untuk tracking
```

### 4. Listen to Events

```typescript
emailQueue.on('completed', (job, result) => {
    console.log('Email sent:', result);
});

emailQueue.on('failed', (job, error) => {
    console.log('Email failed:', error.message);
});
```

## Configuration

### QueueOptions

```typescript
interface QueueOptions<Data = any> {
    concurrency?: number;      // Default: 5
    retry?: RetryOptions;      // Retry config
    limiter?: RateLimitOptions; // Rate limit config
    hooks?: QueueHooks<Data>;  // Callback hooks
    store?: QueueStore<Data>;  // Custom storage
}
```

### Retry Configuration

```typescript
const queue = new JobQueue('tasks', {
    retry: {
        attempts: 3,              // Retry 3 times max
        backoff: 'exponential',   // 'fixed' or 'exponential'
        delay: 1000,              // Initial delay: 1 second
        maxDelay: 60000           // Max delay: 1 minute
    }
});
```

**Exponential backoff example:**
- Attempt 1 fails → wait 1s
- Attempt 2 fails → wait 2s
- Attempt 3 fails → wait 4s
- Attempt 4 = FAIL PERMANENT

### Rate Limiting

```typescript
const queue = new JobQueue('api-calls', {
    concurrency: 10,    // 10 concurrent jobs
    limiter: {
        max: 5,         // But max 5 jobs
        duration: 60000 // Per minute (60 seconds)
    }
});

// Result: 5 jobs per minute, even with 10 concurrency
```

### Custom Storage

Default menggunakan in-memory storage. Bisa custom:

```typescript
class PostgresQueueStore implements QueueStore {
    async enqueue(job: Job) { ... }
    async dequeue(): Promise<Job | undefined> { ... }
    async update(job: Job) { ... }
    async get(id: string) { ... }
    async list(state?: JobState) { ... }
    async stats() { ... }
}

const queue = new JobQueue('email', {
    store: new PostgresQueueStore()
});
```

## Job Handlers

### Simple Handler

```typescript
queue.process('simple-job', async (job) => {
    console.log('Processing:', job.data);
    return { success: true };
});
```

### Handler dengan Error Handling

```typescript
queue.process('risky-job', async (job) => {
    try {
        const result = await riskyOperation(job.data);
        return result;
    } catch (error) {
        throw new Error(`Failed: ${error.message}`);
    }
});
```

### Handler dengan Async Operations

```typescript
queue.process('db-import', async (job) => {
    const records = job.data.records;
    
    // Batch insert
    const inserted = await db.users.insert(records);
    
    // Return count
    return { inserted: inserted.length };
});
```

### Handler Accessing Job Meta

```typescript
queue.process('task', async (job) => {
    console.log('Job ID:', job.id);
    console.log('Attempt:', job.attemptsMade);
    console.log('Max retries:', job.maxAttempts);
    console.log('Priority:', job.priority);
    console.log('Metadata:', job.metadata);
    
    return { done: true };
});
```

## Job States

### State Transitions

```
1. Add job → waiting state
2. Dequeue & start → active state
3. Complete → completed state
   OR fail → delayed state (if retry available) or failed state
```

### Check Job State

```typescript
const job = await queue.add('task', data);
console.log(job.state); // 'waiting'

// Later...
const currentJob = await queue.store.get(job.id);
console.log(currentJob.state); // 'completed', 'failed', etc
```

## Callbacks & Hooks

### Three Types of Callbacks

```typescript
const queue = new JobQueue('email', {
    hooks: {
        onComplete: async (job, result) => {
            // Called when job succeeds
        },
        onFailed: async (job, error) => {
            // Called when job fails permanently
        },
        onRetry: async (job, attempt, delay) => {
            // Called before each retry
        }
    }
});
```

### Example: Email Callbacks

```typescript
const queue = new JobQueue('email', {
    hooks: {
        onComplete: async (job, result) => {
            // Update database: email_logs.status = 'sent'
            await db.emailLogs.update(
                { jobId: job.id },
                { status: 'sent', result }
            );
            
            // Send webhook
            await webhook.post('/events/email-sent', {
                email: job.data.email,
                timestamp: new Date()
            });
        },
        
        onFailed: async (job, error) => {
            // Update database: email_logs.status = 'failed'
            await db.emailLogs.update(
                { jobId: job.id },
                { 
                    status: 'failed',
                    error: error.message,
                    failedAt: new Date()
                }
            );
            
            // Alert admin
            await slack.notify({
                channel: '#alerts',
                text: `Email delivery failed: ${job.data.email}`
            });
        },
        
        onRetry: async (job, attempt, delay) => {
            // Log retry attempt
            await db.jobRetries.insert({
                jobId: job.id,
                attempt,
                nextRetryIn: delay
            });
        }
    }
});
```

## Advanced Features

### 1. Priority Jobs

Higher priority jobs execute first:

```typescript
// Low priority
await queue.add('email', data, { priority: 0 });

// Medium priority
await queue.add('email', data, { priority: 5 });

// High priority (execute first)
await queue.add('email', data, { priority: 10 });
```

### 2. Delayed Jobs

Schedule job untuk nanti:

```typescript
// Run 5 minutes from now
await queue.add('reminder', data, { 
    delay: 5 * 60 * 1000 
});

// Run 1 hour from now
await queue.add('report', data, { 
    delay: 60 * 60 * 1000 
});
```

### 3. Bulk Add

Add multiple jobs at once:

```typescript
const jobs = [
    { name: 'send-email', data: { email: 'user1@ex.com' } },
    { name: 'send-email', data: { email: 'user2@ex.com' } },
    { name: 'send-email', data: { email: 'user3@ex.com' } }
];

await queue.addBulk(jobs);
```

### 4. Manual Retry

Retry failed job manually:

```typescript
try {
    await queue.retry(jobId);
} catch (error) {
    console.log('Job not found');
}
```

### 5. Pause & Resume

Control queue processing:

```typescript
queue.pause();   // Stop processing new jobs
queue.resume();  // Resume processing
```

### 6. Queue Statistics

```typescript
const stats = await queue.stats();

console.log(stats);
// {
//   waiting: 5,
//   active: 2,
//   completed: 100,
//   failed: 3,
//   delayed: 10
// }
```

## Event Listeners

Queue extends EventEmitter, emit 5 events:

```typescript
// Job added to queue
queue.on('added', (job) => {
    console.log('Job added:', job.id);
});

// Job started processing
queue.on('active', (job) => {
    console.log('Job processing:', job.id);
});

// Job completed successfully
queue.on('completed', (job, result) => {
    console.log('Job done:', result);
});

// Job failed
queue.on('failed', (job, error) => {
    console.log('Job error:', error.message);
});

// Job about to retry
queue.on('retrying', (job, attempt, delay) => {
    console.log(`Retry ${attempt} in ${delay}ms`);
});

// Queue paused
queue.on('paused', () => {
    console.log('Queue paused');
});

// Queue resumed
queue.on('resumed', () => {
    console.log('Queue resumed');
});
```

## Best Practices

### 1. Use Meaningful Job Names

```typescript
// Good
queue.process('send-welcome-email', handler);
queue.process('import-users-csv', handler);
queue.process('generate-report', handler);

// Avoid
queue.process('job1', handler);
queue.process('task', handler);
```

### 2. Include Metadata for Tracking

```typescript
await queue.add('email', emailData, {
    metadata: {
        userId: user.id,
        campaignId: campaign.id,
        source: 'signup-flow'
    }
});

// Later in handler
queue.process('email', async (job) => {
    console.log('From campaign:', job.metadata?.campaignId);
});
```

### 3. Set Appropriate Concurrency

```typescript
// Email: 2-5 concurrent (don't overwhelm SMTP)
new JobQueue('email', { concurrency: 3 });

// API calls: 10-20 concurrent
new JobQueue('api', { concurrency: 15 });

// Database: 5-10 concurrent (DB connection limits)
new JobQueue('db', { concurrency: 8 });

// CPU intensive: 1-2 concurrent
new JobQueue('cpu-heavy', { concurrency: 1 });
```

### 4. Use Rate Limiting for External APIs

```typescript
new JobQueue('external-api', {
    concurrency: 20,
    limiter: {
        max: 100,      // 100 requests
        duration: 60000 // per minute (API rate limit)
    }
});
```

### 5. Implement Proper Error Handling

```typescript
queue.process('api-call', async (job) => {
    const maxRetries = 3;
    
    try {
        // Your operation
        const result = await fetchFromAPI(job.data.url);
        return result;
    } catch (error) {
        // Log detailed error
        console.error({
            jobId: job.id,
            attempt: job.attemptsMade,
            maxAttempts: job.maxAttempts,
            error: error.message,
            stack: error.stack
        });
        
        throw error; // Let queue handle retry
    }
});
```

### 6. Use Callbacks for Side Effects

```typescript
const queue = new JobQueue('notifications', {
    hooks: {
        onComplete: async (job, result) => {
            // Update database
            await db.notifications.update(job.id, { 
                status: 'sent',
                sentAt: new Date(),
                result 
            });
        },
        onFailed: async (job, error) => {
            // Store failure reason
            await db.notifications.update(job.id, { 
                status: 'failed',
                error: error.message,
                failedAt: new Date()
            });
            
            // Send alert
            await alertService.notify({
                type: 'notification-failed',
                jobId: job.id,
                error: error.message
            });
        }
    }
});
```

### 7. Validate Job Data

```typescript
import { z } from 'zod';

const emailSchema = z.object({
    email: z.string().email(),
    subject: z.string().min(5),
    message: z.string().min(10)
});

queue.process('send-email', async (job) => {
    // Validate before processing
    const validated = emailSchema.parse(job.data);
    
    return await sendEmail(validated);
});
```

## Examples

### Example 1: Email Queue with Callbacks

```typescript
import { JobQueue } from './src/advanced/jobs/queue';

const emailQueue = new JobQueue('email', {
    concurrency: 3,
    retry: {
        attempts: 3,
        backoff: 'exponential',
        delay: 1000
    },
    hooks: {
        onComplete: async (job, result) => {
            await db.emails.updateStatus(job.id, 'sent');
            await analytics.track('email_sent', {
                email: job.data.email
            });
        },
        onFailed: async (job, error) => {
            await db.emails.updateStatus(job.id, 'failed');
            await alertService.notify({
                message: `Email failed: ${job.data.email}`,
                error: error.message
            });
        }
    }
});

emailQueue.process('send-email', async (job) => {
    const { email, subject, message } = job.data;
    await mailService.send(email, subject, message);
    return { sent: true };
});

// Usage in endpoint
app.post('/api/send-email', async (ctx) => {
    const job = await emailQueue.add('send-email', {
        email: ctx.body.email,
        subject: ctx.body.subject,
        message: ctx.body.message
    });
    
    return { jobId: job.id };
});
```

### Example 2: File Processing Queue

```typescript
const fileQueue = new JobQueue('files', {
    concurrency: 2,
    limiter: {
        max: 10,
        duration: 60000
    }
});

fileQueue.process('process-upload', async (job) => {
    const { fileId, fileName } = job.data;
    
    // Download file
    const file = await storage.download(fileId);
    
    // Process
    const processed = await imageService.optimize(file);
    
    // Upload result
    const resultId = await storage.upload(processed);
    
    return { resultId, fileName };
});

// Add to queue from endpoint
app.post('/api/upload', async (ctx) => {
    const file = ctx.files.file;
    const fileId = await storage.save(file);
    
    const job = await fileQueue.add('process-upload', {
        fileId,
        fileName: file.name
    });
    
    return { 
        fileId,
        jobId: job.id,
        status: 'processing'
    };
});
```

### Example 3: Scheduled Tasks

```typescript
const schedulerQueue = new JobQueue('scheduler', {
    concurrency: 5
});

schedulerQueue.process('send-daily-report', async (job) => {
    const { userId } = job.data;
    const report = await generateReport(userId);
    await emailService.send(userId, 'Daily Report', report);
    return { sent: true };
});

// Schedule every day at 8 AM
setInterval(async () => {
    const now = new Date();
    if (now.getHours() === 8 && now.getMinutes() === 0) {
        const users = await db.users.findAll();
        await schedulerQueue.addBulk(
            users.map(u => ({
                name: 'send-daily-report',
                data: { userId: u.id }
            }))
        );
    }
}, 60000); // Check every minute
```

### Example 4: Data Import

```typescript
const importQueue = new JobQueue('import', {
    concurrency: 1,
    retry: { attempts: 2 }
});

importQueue.process('import-csv', async (job) => {
    const { fileId, userId } = job.data;
    
    // Read CSV
    const file = await storage.read(fileId);
    const records = await parseCSV(file);
    
    // Validate
    const validated = records.map(r => validateRecord(r));
    
    // Insert
    const inserted = await db.users.insertMany(validated);
    
    // Notify user
    await emailService.send(userId, 'Import Complete', 
        `Successfully imported ${inserted.length} records`
    );
    
    return { imported: inserted.length };
});

importQueue.on('failed', async (job, error) => {
    const { userId } = job.data;
    await emailService.send(userId, 'Import Failed', 
        `Error: ${error.message}`
    );
});
```

---

## Summary

Job Queue cocok untuk:
- ✅ Long-running operations (jangan block HTTP response)
- ✅ Retry logic dengan exponential backoff
- ✅ Rate limiting & concurrency control
- ✅ Callback hooks untuk success/failure
- ✅ Priority & delayed job scheduling
- ✅ Bulk operations

Use dengan bijak untuk improve application reliability & user experience!
