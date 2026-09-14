import { renderTrainingGuide } from '../src/training/TrainingGuideWindow';

describe('genetic training guide', () => {
  test('renders actionable instructions and closes from its own button', () => {
    const guideDocument = document.implementation.createHTMLDocument();
    const onClose = jest.fn();

    renderTrainingGuide(guideDocument, onClose);

    expect(guideDocument.title).toBe('Инструкция по генетическому обучению');
    expect(guideDocument.body.textContent).toContain('Как обучать нейросеть');
    expect(guideDocument.body.textContent).toContain('Фоновый — без анимации');
    expect(guideDocument.body.textContent).toContain('Ограничения на число поколений нет');
    expect(guideDocument.body.textContent).toContain('автоматически записывается');
    expect(guideDocument.body.textContent).toContain('validation-чемпион');
    expect(guideDocument.body.textContent).toContain('S + 0, 1, 2, 3, 5, 8');
    expect(guideDocument.body.textContent).toContain('одинаковых картах');
    expect(guideDocument.body.textContent).toContain('Как формируется следующее поколение');
    expect(guideDocument.body.textContent).toContain('пока не реализован');

    guideDocument.querySelector<HTMLButtonElement>('#trainingGuideClose')?.click();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
