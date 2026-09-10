export function openTrainingGuide(sourceWindow: Window = window): boolean {
  const guideWindow = sourceWindow.open('', '_blank');
  if (!guideWindow) return false;

  copyApplicationStyles(sourceWindow.document, guideWindow.document);
  renderTrainingGuide(guideWindow.document, () => guideWindow.close());
  guideWindow.opener = null;
  guideWindow.focus();
  return true;
}

export function renderTrainingGuide(document: Document, onClose: () => void): void {
  document.documentElement.lang = 'ru';
  document.title = 'Инструкция по генетическому обучению';
  document.body.className = 'training-guide-body';
  document.body.innerHTML = trainingGuideMarkup;
  document.querySelector<HTMLButtonElement>('#trainingGuideClose')
    ?.addEventListener('click', onClose);
}

function copyApplicationStyles(source: Document, target: Document): void {
  source.querySelectorAll('style, link[rel="stylesheet"]').forEach((stylesheet) => {
    target.head.appendChild(stylesheet.cloneNode(true));
  });
}

const trainingGuideMarkup = `
  <main class="training-guide">
    <header class="training-guide-header">
      <div>
        <h1 class="training-guide-title">Как обучать нейросеть</h1>
        <p class="training-guide-lead">Краткая инструкция для генетической лаборатории Hungry Snakes.</p>
      </div>
      <button id="trainingGuideClose" type="button" class="btn btn-secondary btn-small">Закрыть</button>
    </header>

    <section class="training-guide-section">
      <h2>1. Быстрая проверка</h2>
      <p>Для первого запуска используйте небольшую конфигурацию: 3 поколения, популяция 8, элита 1, турнир 2, скрытый слой 8 и лимит 500 тиков.</p>
      <p>Установите веса сценариев: одиночный — 1, эвристики — 0, поколение — 0. Нажмите «Начать обучение».</p>
    </section>

    <section class="training-guide-section">
      <h2>2. Рабочие настройки</h2>
      <ul>
        <li><strong>Поколения:</strong> 50–100.</li>
        <li><strong>Популяция:</strong> 32–64.</li>
        <li><strong>Элита:</strong> 2–4; <strong>турнир:</strong> 4.</li>
        <li><strong>Скрытые слои:</strong> <code class="training-lab-code">32,16</code>.</li>
        <li><strong>Скрещивание:</strong> 0,75; <strong>мутация:</strong> 0,05; <strong>сила мутации:</strong> 0,1.</li>
        <li><strong>Лимит:</strong> 5 000–10 000 тиков; validation — каждые 10 поколений.</li>
        <li><strong>Сценарии:</strong> одиночный 0,5; против эвристик 0,3; внутри поколения 0,2.</li>
      </ul>
      <p>Большая популяция и длинные прогоны требуют много времени. Сначала проверьте параметры на 10–30 поколениях.</p>
    </section>

    <section class="training-guide-section">
      <h2>3. Что означают сценарии</h2>
      <ul>
        <li><strong>Одиночный:</strong> кандидат играет без соперников.</li>
        <li><strong>Эвристики:</strong> кандидат играет против ботов basic и solid.</li>
        <li><strong>Поколение:</strong> кандидат играет против другой нейросети текущего поколения.</li>
      </ul>
      <p>Хотя бы один вес должен быть больше нуля. Seed позволяет повторить обучение с теми же начальными условиями.</p>
    </section>

    <section class="training-guide-section">
      <h2>4. Результаты</h2>
      <p>Во время обучения таблица и график показывают лучший, средний, медианный и validation fitness, очки, выживание, победы, разнообразие и скорость симуляции.</p>
      <p>После первого поколения чемпион автоматически запускается на Canvas. Над полем показываются его поколение, рекорд fitness, средние характеристики и результат текущей игры.</p>
      <p>Текущая партия всегда доигрывается до конца, после чего запускается самый новый чемпион. Скорость validation replay можно менять от 1x до 1000x. Кнопка «CSV отчёт» скачивает статистику поколений.</p>
    </section>

    <section class="training-guide-section">
      <h2>5. Сохранение и запуск модели</h2>
      <p>Нажмите «Сохранить», чтобы записать модель в localStorage текущего браузера. Хранилище содержит не более 10 моделей и очищается вместе с данными сайта.</p>
      <p>Для постоянной копии нажмите «Скачать»: JSON содержит топологию, веса, настройки и метрики. Кнопка «Импорт» возвращает такой файл в браузер.</p>
      <p>В списке сохранённых моделей кнопка «Показать» запускает отдельный validation replay. Выбор обученной модели для обычной одиночной или сетевой игры пока не реализован.</p>
    </section>
  </main>
`;
