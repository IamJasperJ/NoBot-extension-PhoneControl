import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import type { ExtensionStorage } from '../../apps/server/src/extensions/types'
import type { Command, Result } from './protocol'

interface Device {
  id: string
  hash: string
  lastSeen: number
  ready: boolean
}
interface Job {
  id: string
  deviceId: string
  command: Command
  expiresAt: number
  state: 'queued' | 'delivered' | 'done' | 'cancelled'
  result?: Result
}
const digest = (token: string) => createHash('sha256').update(token).digest()

/** 所有状态走宿主的用户级存储；不以模块全局变量缓存用户数据。 */
export class Bridge {
  constructor(
    private storage: ExtensionStorage,
    private now: () => number = Date.now,
  ) {}

  pair() {
    const token = randomBytes(32).toString('hex')
    const id = randomBytes(16).toString('hex')
    this.revoke()
    this.storage.set('device', { id, hash: digest(token).toString('hex'), lastSeen: 0, ready: false })
    return { deviceId: id, token, protocol: 1 }
  }

  revoke() {
    this.storage.delete('device')
    this.storage.delete('job')
  }

  authenticate(id: string, token: string) {
    const device = this.storage.get<Device>('device')
    if (!device || device.id !== id || token.length !== 64) return false
    return timingSafeEqual(digest(token), Buffer.from(device.hash, 'hex'))
  }

  status() {
    const device = this.storage.get<Device>('device')
    const job = this.storage.get<Job>('job')
    return {
      paired: !!device,
      deviceId: device?.id,
      online: !!device && device.lastSeen > 0 && this.now() - device.lastSeen < 15_000,
      ready: device?.ready ?? false,
      lastSeen: device?.lastSeen ?? null,
      job: job
        ? { id: job.id, state: job.expiresAt <= this.now() && job.state !== 'done' ? 'expired' : job.state }
        : null,
    }
  }

  poll(id: string, ready: boolean) {
    const device = this.storage.get<Device>('device')
    if (!device || device.id !== id) throw new Error('UNAUTHORIZED')
    this.storage.set('device', { ...device, lastSeen: this.now(), ready })
    const job = this.storage.get<Job>('job')
    if (!ready || !job || job.deviceId !== id || job.state !== 'queued' || job.expiresAt <= this.now()) return null
    // 交付即锁定，响应丢失也不重新派发，避免真实设备重复发送或点击。
    this.storage.set('job', { ...job, state: 'delivered' })
    return { id: job.id, command: job.command, ttlMs: job.expiresAt - this.now() }
  }

  enqueue(command: Command) {
    const status = this.status()
    if (!status.online || !status.ready || !status.deviceId) throw new Error('DEVICE_OFFLINE')
    const previous = this.storage.get<Job>('job')
    if (previous && ['queued', 'delivered'].includes(previous.state) && previous.expiresAt > this.now())
      throw new Error('DEVICE_BUSY')
    const id = randomBytes(16).toString('hex')
    this.storage.set('job', { id, deviceId: status.deviceId, command, expiresAt: this.now() + 25_000, state: 'queued' })
    return id
  }

  finish(deviceId: string, id: string, result: Result) {
    const job = this.storage.get<Job>('job')
    if (!job || job.deviceId !== deviceId || job.id !== id || job.expiresAt <= this.now()) return false
    if (job.state === 'done') return true
    if (job.state !== 'delivered') return false
    this.storage.set('job', { ...job, state: 'done', result })
    return true
  }

  result(id: string): Result | null {
    const job = this.storage.get<Job>('job')
    if (!job || job.id !== id || job.state === 'cancelled') throw new Error('CANCELLED')
    if (job.state === 'done') return job.result ?? null
    if (job.expiresAt <= this.now()) throw new Error('OUTCOME_UNKNOWN')
    return null
  }

  cancel(id?: string) {
    const job = this.storage.get<Job>('job')
    if (job && (!id || id === job.id) && job.state === 'queued') {
      // 保留租约到期时间，取消等待不能让另一条指令与已交付的手势并发。
      this.storage.set('job', { ...job, state: 'cancelled' })
    }
  }

  clear(id: string) {
    if (this.storage.get<Job>('job')?.id === id) this.storage.delete('job')
  }
}
