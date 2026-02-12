const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';

  return {
    entry: './src/index.ts',
    output: {
      filename: isProduction ? 'bundle.[contenthash].js' : 'bundle.js',
      path: path.resolve(__dirname, 'dist'),
      clean: true,
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
      }),
    ],
    devServer: {
      static: path.resolve(__dirname, 'dist'),
      port: 3000,
      hot: true,
      open: false,
    },
    devtool: isProduction ? 'source-map' : 'eval-source-map',
  };
};
