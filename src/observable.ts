import { Observable, PartialObserver, Subscription } from 'rxjs';

/**
 *
 * if inner observable hasn't complete, and source observable trigger new value, the
 * inner observable's value will be abandon. and after inner observable complete the
 * lastest source observable value will be trigger.
 *
 */
export function waitMap<T, K>(fn: (res: T) => Observable<K>): (obs: Observable<T>) => Observable<K> {
  return (preObs: Observable<T>) => {
    return Observable.create((observer: PartialObserver<K>) => {
      let closed = false
      let latestRes: T
      let resultSubp: Subscription
      let subp: Subscription
      const run = (res: T) => {
        const obs = fn(res)
        return obs.subscribe({
          next: res => {
            if (!latestRes) {
              observer.next(res)
            }
          },
          error: err => {
            closed = true
            observer.error(err)
            resultSubp.unsubscribe()
          },
          complete: () => {
            if (latestRes && !closed) {
              const res = latestRes
              latestRes = undefined
              run(res)
            }
          }
        })
      }
      resultSubp = preObs.subscribe({
        next: res => {
          latestRes = res
          if (!subp || subp.closed) {
            latestRes = undefined
            subp = run(res)
          }
        },
        error: err => {
          closed = true
          observer.error(err)
        },
        complete: () => {
          closed = true
          observer.complete()
        }
      })
      return resultSubp
    })
  }
}
