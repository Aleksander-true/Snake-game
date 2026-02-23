const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const webpack = require('webpack');

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';
  const isDevMode = !!(env && env.devmode);
  const isNoMinify = !!(env && env.noMinify);
  const publicPath = env && env.publicPath ? env.publicPath : '/';

  return {
    entry: './src/index.ts',
    output: {
      filename: isProduction ? 'bundle.[contenthash].js' : 'bundle.js',
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
        template: './src/index.html',
        title: 'Snake Eats Rabbits',
        favicon: path.resolve(__dirname, 'src/assets/images/snake.ico'),
      }),
      new webpack.DefinePlugin({
        __DEV_MODE__: JSON.stringify(isDevMode),
      }),
    ],
    devServer: {
      static: path.resolve(__dirname, 'dist'),
      port: 3000,
      hot: true,
      open: false,
    },
    devtool: isProduction ? 'source-map' : 'eval-source-map',
    optimization: {
      minimize: isProduction && !isNoMinify,
    },
  };
};
