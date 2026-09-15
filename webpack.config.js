const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const webpack = require('webpack');

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';
  const isDevMode = !!(env && env.devmode);
  const isNoMinify = !!(env && env.noMinify);
  const publicPath = env && env.publicPath ? env.publicPath : '/';

  return {
    entry: {
      game: './apps/web/src/index.ts',
      lab: './apps/web/src/lab/index.ts',
    },
    output: {
      filename: isProduction ? '[name].[contenthash].js' : '[name].js',
      path: path.resolve(__dirname, 'dist'),
      clean: true,
      publicPath,
    },
    resolve: {
      extensions: ['.ts', '.js'],
    },
    module: {
      rules: [
        {
          test: /\.ts$/,
          use: 'ts-loader',
          exclude: /node_modules/,
        },
        {
          test: /\.css$/,
          use: ['style-loader', 'css-loader'],
        },
      ],
    },
    plugins: [
      new HtmlWebpackPlugin({
        template: './apps/web/src/index.html',
        title: 'Snake Eats Rabbits',
        favicon: path.resolve(__dirname, 'apps/web/src/assets/images/snake.ico'),
        chunks: ['game'],
      }),
      new HtmlWebpackPlugin({
        template: './apps/web/src/lab/index.html',
        filename: 'lab/index.html',
        title: 'Лаборатория обучения — Голодные змейки',
        favicon: path.resolve(__dirname, 'apps/web/src/assets/images/snake.ico'),
        chunks: ['lab'],
      }),
      new webpack.DefinePlugin({
        __DEV_MODE__: JSON.stringify(isDevMode),
      }),
    ],
    devServer: {
      static: path.resolve(__dirname, 'dist'),
      port: 8080,
      hot: true,
      open: false,
      client: {
        webSocketURL: {
          pathname: '/ws-hmr',
        },
      },
      webSocketServer: {
        type: 'ws',
        options: {
          path: '/ws-hmr',
        },
      },
      proxy: [
        {
          context: (pathname) => pathname.startsWith('/api/'),
          target: 'http://127.0.0.1:3001',
        },
        {
          context: (pathname) => pathname === '/health',
          target: 'http://127.0.0.1:3001',
        },
        {
          context: (pathname) => pathname === '/ws',
          target: 'ws://127.0.0.1:3001',
          ws: true,
        },
      ],
    },
    devtool: isProduction ? 'source-map' : 'eval-source-map',
    optimization: {
      minimize: isProduction && !isNoMinify,
    },
  };
};
