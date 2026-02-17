import './app/ui/styles';
import { SnakeGameApplication } from './app/SnakeGameApplication';

const appRoot = document.getElementById('app');
if (!appRoot) {
  throw new Error('Root element #app not found');
}

const app = new SnakeGameApplication(appRoot);
app.init();
