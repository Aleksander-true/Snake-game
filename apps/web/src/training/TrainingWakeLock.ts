interface WakeLockSentinelLike {
  released: boolean;
  release(): Promise<void>;
  addEventListener(type: 'release', listener: () => void): void;
}

interface WakeLockNavigatorLike {
  wakeLock?: {
    request(type: 'screen'): Promise<WakeLockSentinelLike>;
  };
}

export class TrainingWakeLock {
  private sentinel: WakeLockSentinelLike | null = null;
  private started = false;

  constructor(
    private readonly onStatus: (message: string) => void,
    private readonly sourceDocument: Document = document,
    private readonly sourceNavigator: WakeLockNavigatorLike = navigator,
  ) {}

  start(): void {
    if (this.started) return;
    this.started = true;
    this.sourceDocument.addEventListener('visibilitychange', this.handleVisibilityChange);
    this.requestLock();
  }

  stop(): void {
    if (!this.started && !this.sentinel) return;
    this.started = false;
    this.sourceDocument.removeEventListener('visibilitychange', this.handleVisibilityChange);
    const sentinel = this.sentinel;
    this.sentinel = null;
    if (sentinel && !sentinel.released) {
      sentinel.release().catch(() => undefined);
    }
  }

  private requestLock(): void {
    if (!this.started || this.sentinel) return;
    if (!this.sourceNavigator.wakeLock) {
      this.onStatus('Wake Lock не поддерживается браузером — отключите сон компьютера в настройках ОС.');
      return;
    }
    if (this.sourceDocument.visibilityState !== 'visible') {
      this.onStatus('Wake Lock приостановлен — оставьте вкладку видимой, чтобы компьютер не уснул.');
      return;
    }
    this.sourceNavigator.wakeLock.request('screen').then((sentinel) => {
      if (!this.started) {
        sentinel.release().catch(() => undefined);
        return;
      }
      this.sentinel = sentinel;
      this.onStatus('Wake Lock активен: экран и компьютер не должны переходить в сон.');
      sentinel.addEventListener('release', () => {
        if (this.sentinel === sentinel) this.sentinel = null;
        if (this.started) {
          this.onStatus('Wake Lock снят браузером — верните вкладку на экран для повторного включения.');
        }
      });
    }).catch(() => {
      this.onStatus('Не удалось включить Wake Lock — проверьте разрешения браузера и настройки сна ОС.');
    });
  }

  private handleVisibilityChange = (): void => {
    if (this.sourceDocument.visibilityState === 'visible') this.requestLock();
  };
}
