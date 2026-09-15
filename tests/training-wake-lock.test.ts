import { TrainingWakeLock } from '../apps/web/src/training/TrainingWakeLock';

describe('training wake lock', () => {
  test('acquires, reports and releases the screen lock', async () => {
    const release = jest.fn().mockResolvedValue(undefined);
    const sentinel = {
      released: false,
      release,
      addEventListener: jest.fn(),
    };
    const request = jest.fn().mockResolvedValue(sentinel);
    const statuses: string[] = [];
    const wakeLock = new TrainingWakeLock(
      (message) => statuses.push(message),
      document,
      { wakeLock: { request } },
    );

    wakeLock.start();
    await Promise.resolve();

    expect(request).toHaveBeenCalledWith('screen');
    expect(statuses[statuses.length - 1]).toContain('Wake Lock активен');

    wakeLock.stop();
    await Promise.resolve();
    expect(release).toHaveBeenCalledTimes(1);
  });

  test('explains when the browser does not support wake lock', () => {
    const onStatus = jest.fn();
    const wakeLock = new TrainingWakeLock(onStatus, document, {});

    wakeLock.start();

    expect(onStatus).toHaveBeenCalledWith(expect.stringContaining('не поддерживается'));
    wakeLock.stop();
  });
});
