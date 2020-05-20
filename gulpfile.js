const gulp = require('gulp');
const del = require('del');
const sourcemaps = require('gulp-sourcemaps');
const ts = require('gulp-typescript');
const tsProject = ts.createProject('tsconfig.json');

function buildTs() {
    return gulp.src('./src/**/*.ts')
        .pipe(sourcemaps.init())
        .pipe(tsProject())
        .on('error', function (err) {
            this.emit('end');
        })
        .pipe(sourcemaps.write({ sourceRoot: (file) => file.cwd + '/src' }))
        .pipe(gulp.dest('./dist/'));
}

function clean() {
    return del([
        'dist/'
    ]);
}

function watch() {
    gulp.watch('src/script/**/*.ts', buildTs);
}

const build = gulp.parallel(buildTs);
const defaultTask = gulp.series(clean, buildTs);

exports.default = defaultTask;
exports.build = build;
exports.watch = watch;
exports.clean = clean;

exports.ts = buildTs;
