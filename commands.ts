import type { Bridge } from './bridge'
import type { Command, Result } from './protocol'

/**
 * 发一条指令并等手机回报。抛出的错误码：DEVICE_OFFLINE / DEVICE_BUSY（排不上队）、
 * CANCELLED（被取消或 signal 中止）、OUTCOME_UNKNOWN（超时，结果未知，必须重新观察）。
 */
export async function runCommand(
  bridge: Bridge,
  command: Command,
  signal: AbortSignal,
  taskId?: string,
): Promise<Result> {
  signal.throwIfAborted()
  const id = bridge.enqueue(command, taskId)
  try {
    while (true) {
      if (signal.aborted) throw new Error('CANCELLED')
      const result = bridge.result(id)
      if (result) {
        bridge.clear(id)
        return result
      }
      await delay(250, signal)
    }
  } catch (error) {
    bridge.cancel(id)
    throw error
  }
}

/** 可被 signal 打断的等待；打断时抛 CANCELLED */
export function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(new Error('CANCELLED'))
    const abort = () => {
      clearTimeout(timer)
      reject(new Error('CANCELLED'))
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort)
      resolve()
    }, ms)
    signal.addEventListener('abort', abort, { once: true })
  })
}
