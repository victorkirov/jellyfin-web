const fg = require('fast-glob');
const path = require('path');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');
const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const { ContextExclusionPlugin, DefinePlugin } = require('webpack');
const packageJson = require('./package.json');

const Assets = [
    'native-promise-only/npo.js',
    '@jellyfin/libass-wasm/dist/js/default.woff2',
    '@jellyfin/libass-wasm/dist/js/subtitles-octopus-worker.js',
    '@jellyfin/libass-wasm/dist/js/subtitles-octopus-worker.wasm',
    '@jellyfin/libass-wasm/dist/js/subtitles-octopus-worker-legacy.js'
];

const DEV_MODE = process.env.NODE_ENV !== 'production';
let COMMIT_SHA = '';
try {
    COMMIT_SHA = require('child_process')
        // eslint-disable-next-line sonarjs/no-os-command-from-path
        .execSync('git describe --always --dirty')
        .toString()
        .trim();
} catch (err) {
    console.warn('Failed to get commit sha. Is git installed?', err);
}

const NODE_MODULES_REGEX = /[\\/]node_modules[\\/]/;

const THEMES = fg.globSync('themes/**/*.scss', { cwd: path.resolve(__dirname, 'src') });
const THEMES_BY_ID = THEMES.reduce((acc, theme) => {
    acc[theme.substring(0, theme.lastIndexOf('/'))] = `./${theme}`;
    return acc;
}, {});

const config = {
    context: path.resolve(__dirname, 'src'),
    target: 'browserslist',
    entry: {
        'main.jellyfin': './index.jsx',
        ...THEMES_BY_ID
    },
    resolve: {
        alias: {
            // core-js replaces the native JSON.parse with a much slower JavaScript parser in browsers
            // without native Symbol support (e.g. webOS 3.x) to add JSON.parse source text access,
            // which is not used
            [path.resolve(__dirname, 'node_modules/core-js/modules/es.json.parse.js')]: false
        },
        extensions: ['.tsx', '.ts', '.js'],
        modules: [
            path.resolve(__dirname, 'src'),
            path.resolve(__dirname, 'node_modules')
        ]
    },
    plugins: [
        // Keep colocated tests out of dynamic import contexts.
        new ContextExclusionPlugin(/\.test\./),
        new DefinePlugin({
            __COMMIT_SHA__: JSON.stringify(COMMIT_SHA),
            __JF_BUILD_VERSION__: JSON.stringify(
                process.env.WEBPACK_SERVE ?
                    'Dev Server' :
                    process.env.JELLYFIN_VERSION || 'Release'),
            __PACKAGE_JSON_NAME__: JSON.stringify(packageJson.name),
            __PACKAGE_JSON_VERSION__: JSON.stringify(packageJson.version),
            __WEBPACK_SERVE__: !!JSON.parse(process.env.WEBPACK_SERVE || '0')
        }),
        new CleanWebpackPlugin(),
        new HtmlWebpackPlugin({
            filename: 'index.html',
            template: 'index.html',
            // Append file hashes to bundle urls for cache busting
            hash: true,
            chunks: [
                'main.jellyfin'
            ]
        }),
        new CopyPlugin({
            patterns: [
                {
                    from: 'assets',
                    to: 'assets'
                },
                'config.json',
                'robots.txt',
                {
                    from: 'touchicon*.png',
                    context: path.resolve(__dirname, 'node_modules/@jellyfin/ux-web/favicons'),
                    to: 'favicons'
                },
                ...Assets.map(asset => {
                    return {
                        from: path.resolve(__dirname, `node_modules/${asset}`),
                        to: 'libraries'
                    };
                })
            ]
        }),
        new ForkTsCheckerWebpackPlugin({
            typescript: {
                configFile: path.resolve(__dirname, 'tsconfig.json')
            }
        }),
        new MiniCssExtractPlugin({
            filename: pathData => {
                if (pathData.chunk?.name?.startsWith('themes/')) {
                    return '[name]/theme.css';
                }
                return '[name].[contenthash].css';
            },
            chunkFilename: '[name].[contenthash].css'
        })
    ],
    output: {
        filename: '[name].bundle.js',
        chunkFilename: '[name].[contenthash].chunk.js',
        assetModuleFilename: pathData => {
            if (pathData.filename === 'manifest.json') {
                return '[base]';
            }
            if (pathData.filename.startsWith('assets/') || pathData.filename.startsWith('themes/')) {
                return '[path][base][query]';
            }
            return '[name].[hash][ext][query]';
        },
        path: path.resolve(__dirname, 'dist'),
        publicPath: ''
    },
    optimization: {
        runtimeChunk: 'single',
        removeAvailableModules: false,
        removeEmptyChunks: false,
        splitChunks: {
            chunks: 'all',
            maxInitialRequests: Infinity,
            cacheGroups: {
                node_modules: {
                    test(module) {
                        return NODE_MODULES_REGEX.test(module.context);
                    },
                    name(module, chunks) {
                        // get the name. E.g. node_modules/packageName/not/this/part.js
                        // or node_modules/packageName
                        const packageName = module.context.match(/[\\/]node_modules[\\/](.*?)([\\/]|$)/)[1];
                        // Keep locale chunks named separately, but leave other lazy modules async.
                        const isDateLocale = packageName === 'date-fns'
                            && /[\\/]locale([\\/]|$)/.test(module.context);
                        if (!isDateLocale && !chunks.some(chunk => chunk.canBeInitial())) {
                            return undefined;
                        }

                        // if "packageName" is a namespace (i.e. @jellyfin) get the namespace + packageName
                        if (packageName.startsWith('@')) {
                            const parts = module.context
                                .substring(module.context.lastIndexOf(packageName))
                                .split(/[\\/]/);
                            return `node_modules.${parts[0]}.${parts[1]}`;
                        }

                        if (packageName === 'date-fns') {
                            const parts = module.context
                                .substring(module.context.lastIndexOf(packageName))
                                .split(/[\\/]/);

                            let name = `node_modules.${parts[0]}`;
                            if (parts[1]) {
                                name += `.${parts[1]}`;

                                if (parts[1] === 'locale' && parts[2]) {
                                    name += `.${parts[2]}`;
                                }
                            }

                            return name;
                        }

                        return `node_modules.${packageName}`;
                    }
                }
            }
        }
    },
    module: {
        rules: [
            {
                test: /\.(html)$/,
                use: {
                    loader: 'html-loader'
                }
            },
            {
                test: /\.(js|jsx|mjs)$/,
                include: [
                    path.resolve(__dirname, 'node_modules/@jellyfin/libass-wasm'),
                    path.resolve(__dirname, 'node_modules/@jellyfin/sdk'),
                    path.resolve(__dirname, 'node_modules/@mui/material'),
                    path.resolve(__dirname, 'node_modules/@mui/private-theming'),
                    path.resolve(__dirname, 'node_modules/@mui/styled-engine'),
                    path.resolve(__dirname, 'node_modules/@mui/system'),
                    path.resolve(__dirname, 'node_modules/@mui/utils'),
                    path.resolve(__dirname, 'node_modules/@remix-run/router'),
                    path.resolve(__dirname, 'node_modules/@tanstack/query-core'),
                    path.resolve(__dirname, 'node_modules/@tanstack/query-persist-client-core'),
                    path.resolve(__dirname, 'node_modules/@tanstack/react-query'),
                    path.resolve(__dirname, 'node_modules/@uupaa/dynamic-import-polyfill'),
                    path.resolve(__dirname, 'node_modules/axios'),
                    path.resolve(__dirname, 'node_modules/blurhash'),
                    path.resolve(__dirname, 'node_modules/date-fns'),
                    path.resolve(__dirname, 'node_modules/flv.js'),
                    path.resolve(__dirname, 'node_modules/idb-keyval'),
                    path.resolve(__dirname, 'node_modules/libbitsub'),
                    path.resolve(__dirname, 'node_modules/linkify-it'),
                    path.resolve(__dirname, 'node_modules/markdown-it'),
                    path.resolve(__dirname, 'node_modules/mdurl'),
                    path.resolve(__dirname, 'node_modules/proxy-polyfill'),
                    path.resolve(__dirname, 'node_modules/punycode'),
                    path.resolve(__dirname, 'node_modules/react-router'),
                    path.resolve(__dirname, 'node_modules/screenfull'),
                    path.resolve(__dirname, 'node_modules/swiper'),
                    path.resolve(__dirname, 'node_modules/usehooks-ts'),
                    path.resolve(__dirname, 'src')
                ],
                use: [{
                    loader: 'babel-loader',
                    options: {
                        cacheCompression: false,
                        cacheDirectory: true
                    }
                }]
            },
            // Strict EcmaScript modules require additional flags
            {
                test: /\.(js|jsx|mjs)$/,
                include: [
                    path.resolve(__dirname, 'node_modules/@tanstack/query-devtools')
                ],
                resolve: {
                    fullySpecified: false
                },
                use: [{
                    loader: 'babel-loader',
                    options: {
                        cacheCompression: false,
                        cacheDirectory: true
                    }
                }]
            },
            {
                test: /\.worker\.ts$/,
                exclude: /node_modules/,
                use: [
                    'worker-loader',
                    {
                        loader: 'ts-loader',
                        options: {
                            transpileOnly: true
                        }
                    }
                ]
            },
            {
                test: /\.(ts|tsx)$/,
                exclude: /node_modules/,
                use: [{
                    loader: 'ts-loader',
                    options: {
                        transpileOnly: true
                    }
                }]
            },
            {
                test: /\.(sa|sc|c)ss$/i,
                oneOf: [
                    {
                        // Themes always need to use the MiniCssExtractPlugin since they are loaded directly
                        include: [
                            path.resolve(__dirname, 'src/themes/')
                        ],
                        use: [
                            {
                                loader: MiniCssExtractPlugin.loader,
                                options: {
                                    publicPath: '../../'
                                }
                            },
                            'css-loader',
                            {
                                loader: 'postcss-loader',
                                options: {
                                    postcssOptions: {
                                        config: path.resolve(__dirname, 'postcss.config.js')
                                    }
                                }
                            },
                            'sass-loader'
                        ]
                    },
                    {
                        use: [
                            DEV_MODE ? 'style-loader' : MiniCssExtractPlugin.loader,
                            'css-loader',
                            {
                                loader: 'postcss-loader',
                                options: {
                                    postcssOptions: {
                                        config: path.resolve(__dirname, 'postcss.config.js')
                                    }
                                }
                            },
                            'sass-loader'
                        ]
                    }
                ]
            },
            {
                test: /\.(ico|png|jpg|gif|svg)$/i,
                type: 'asset/resource'
            },
            {
                test: /\.(woff|woff2|eot|ttf|otf)$/,
                type: 'asset/resource'
            },
            {
                test: /\.(mp3)$/i,
                type: 'asset/resource'
            }
        ]
    }
};

module.exports = config;
