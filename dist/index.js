'use strict';

var gaze = require('gaze');
var glob = require('glob');
var path = require('path');
var spritesmith$1 = require('spritesmith');
var _ = require('lodash');
var templater = require('spritesheet-templates');
var mkdirp = require('mkdirp');
var fs = require('fs-extra');

function _interopDefaultLegacy (e) { return e && typeof e === 'object' && 'default' in e ? e : { 'default': e }; }

var gaze__default = /*#__PURE__*/_interopDefaultLegacy(gaze);
var glob__default = /*#__PURE__*/_interopDefaultLegacy(glob);
var path__default = /*#__PURE__*/_interopDefaultLegacy(path);
var spritesmith__default = /*#__PURE__*/_interopDefaultLegacy(spritesmith$1);
var ___default = /*#__PURE__*/_interopDefaultLegacy(_);
var templater__default = /*#__PURE__*/_interopDefaultLegacy(templater);
var mkdirp__default = /*#__PURE__*/_interopDefaultLegacy(mkdirp);
var fs__default = /*#__PURE__*/_interopDefaultLegacy(fs);

const promiseCall = (fn, ...args) =>
  new Promise((resolve, reject) =>
    fn(...args, (err, result) => (err ? reject(err) : resolve(result)))
  );

const writeFileR = async (...args) => {
  const fileName = args[0];
  await mkdirp__default['default'](path__default['default'].dirname(fileName));
  return fs__default['default'].writeFile(...args);
};

const sendToPast = (fileName, bypass) => {
  if (bypass) return Promise.resolve();
  return fs__default['default'].utimes(
    fileName,
    new Date(Date.now() - 10000),
    new Date(Date.now() - 10000)
  );
};

const writeCss = async (sources, templaterData) => {
  return await Promise.all(
    sources.map(async (css) => {
      const fileName = css[0];
      const code = templater__default['default'](templaterData, css[1]);
      await writeFileR(fileName, code);
      await sendToPast(fileName);

      return fileName;
    })
  );
};
const spriteSheetFormat = (spritesmithResult, options) => {
  const generateSpriteName = (fileName) => {
    return path__default['default'].parse(path__default['default'].relative(options.src.cwd, fileName)).name;
  };
  const sprites = ___default['default'].map(
    spritesmithResult.coordinates,
    function (oneSourceInfo, fileName) {
      return ___default['default'].assign({ name: generateSpriteName(fileName) }, oneSourceInfo);
    }
  );
  const spritesheet = ___default['default'].assign(
    { image: options.apiOptions.cssImageRef },
    spritesmithResult.properties
  );

  return {
    sprites: sprites,
    spritesheet: spritesheet,
    spritesheet_info: options.apiOptions.spritesheet_info,
  };
};

const compileNormal = (files, options) => {
  const { target } = options;
  spritesmith__default['default'].run(
    ___default['default'].merge({}, { src: files }, options.spritesmithOptions),
    (err, result) => {
      if (err) {
        throw err;
      }
      const spritesheetTemplatesData = spriteSheetFormat(result, options);
      // write the sprite image file and stylesheet
      Promise.all([
        writeFileR(target.image, result.image, 'binary'),
        writeCss(target.css, spritesheetTemplatesData),
      ]);
    }
  );
};

function getSpritesForSpritesheetTemplates(
  combinedSources,
  prefix,
  field,
  sourceField
) {
  return ___default['default'].map(combinedSources, (sprite) => ({
    name: prefix + sprite.apiName,
    source_image: sprite[sourceField],
    x: sprite[field].x,
    y: sprite[field].y,
    width: sprite[field].width,
    height: sprite[field].height,
  }));
}

const compileRetina = async (files, options) => {
  const { src, target, retina, apiOptions, spritesmithOptions } = options;
  const sourceRecords = files.map((fileName) => {
    const oneRecord = retina.classifier(path__default['default'].resolve(src.cwd, fileName));
    return {
      ...oneRecord,
      apiName: apiOptions.generateSpriteName(oneRecord.normalName),
    };
  });

  const combinedSources = ___default['default'].map(
    ___default['default'].groupBy(sourceRecords, 'apiName'),
    (group) => {
      const result = ___default['default'].clone(group[0]);
      group.forEach((oneRecord) => {
        result[oneRecord.type] = true;
      });
      return result;
    }
  );

  const results = await Promise.all([
    promiseCall(
      spritesmith__default['default'].run.bind(spritesmith__default['default'], {
        ...spritesmithOptions,
        src: ___default['default'].map(combinedSources, 'normalName'),
      })
    ),
    promiseCall(
      spritesmith__default['default'].run.bind(spritesmith__default['default'], {
        ...spritesmithOptions,
        src: ___default['default'].map(combinedSources, 'retinaName'),
        padding: (spritesmithOptions.padding || 0) * 2,
      })
    ),
  ]);

  combinedSources.forEach((oneSource) => {
    oneSource.normalCoordinates = results[0].coordinates[oneSource.normalName];
    oneSource.retinaCoordinates = results[1].coordinates[oneSource.retinaName];
  });

  const normalSprites = getSpritesForSpritesheetTemplates(
    combinedSources,
    '',
    'normalCoordinates',
    'normalName'
  );
  const retinaSprites = getSpritesForSpritesheetTemplates(
    combinedSources,
    'retina_',
    'retinaCoordinates',
    'retinaName'
  );

  const spritesheetTemplatesData = {
    retina_spritesheet_info: apiOptions.retina_spritesheet_info,
    sprites: normalSprites,
    spritesheet: {
      width: results[0].properties.width,
      height: results[0].properties.height,
      image: apiOptions.cssImageRef,
    },
    retina_sprites: retinaSprites,
    retina_spritesheet: {
      width: results[1].properties.width,
      height: results[1].properties.height,
      image: retina.cssImageRef,
    },
    retina_groups: combinedSources.map((sprite, i) => ({
      name: sprite.apiName,
      index: i,
    })),
  };

  Promise.all([
    writeFileR(target.image, results[0].image, 'binary'),
    writeFileR(retina.targetImage, results[1].image, 'binary'),
    writeCss(target.css, spritesheetTemplatesData),
  ]);
};

const compile = (files, options, useRetina = false) => {
  let compileStrategy = useRetina ? compileRetina : compileNormal;
  compileStrategy(files, options);
};

const MINE_TYPES = {
  '.stylus': 'stylus',
  '.styl': 'stylus',
  '.sass': 'sass',
  '.scss': 'scss',
  '.less': 'less',
  '.json': 'json',
  '.css': 'css',
};
const fThrowExpectField = (f) => {
  throw `Expected field "${f}" in options of SpritesmithPlugin`;
};

const extractFormatFromCSSFilename = (cssFileName) =>
  MINE_TYPES[path__default['default'].parse(cssFileName).ext];

const normalizeTargetCss = (mergedOptions) => {
  let css = mergedOptions.target.css;

  if (!Array.isArray(css)) {
    css = [[css, mergedOptions.spritesheetTemplatesOptions]];
  }

  return css.map((css, i) => {
    if (typeof css === 'string') {
      return [
        css,
        {
          format: extractFormatFromCSSFilename(css),
        },
      ];
    }
    if (Array.isArray(css)) {
      const [cssFileName, options = {}] = css.slice(0);
      const format =
        options.format || extractFormatFromCSSFilename(cssFileName);
      return [cssFileName, { ...options, format }];
    }
    throw new Error(`'target.css[${i}] must be String or Array'`);
  });
};

const endsWith = (suffix, str) => str.slice(-suffix.length) === suffix;

const splitExt = (fileName) => {
  const extInd = fileName.lastIndexOf('.');
  return {
    name: fileName.slice(0, extInd),
    ext: fileName.slice(extInd),
  };
};

const addSuffixToFileName = (suffix, fileName, pathImpl) => {
  const parsed = pathImpl.parse(fileName);
  parsed.name += suffix;
  parsed.base = parsed.name + parsed.ext;
  return pathImpl.format(parsed);
};

const suffixToClassifier = (suffix) => (fileName) => {
  const parsed = splitExt(fileName);
  if (endsWith(suffix, parsed.name)) {
    return {
      type: 'retina',
      retinaName: fileName,
      normalName: parsed.name.slice(0, -suffix.length) + parsed.ext,
    };
  } else {
    return {
      type: 'normal',
      retinaName: parsed.name + suffix + parsed.ext,
      normalName: fileName,
    };
  }
};

const processRetinaOptions = (options) => {
  if (!('retina' in options)) {
    return;
  }

  if (typeof options.retina === 'string') {
    const suffix = options.retina;
    const r = (options.retina = {
      classifier: suffixToClassifier(suffix),
    });

    r.targetImage = addSuffixToFileName(suffix, options.target.image, path__default['default']);
    r.cssImageRef = addSuffixToFileName(
      suffix,
      options.apiOptions.cssImageRef,
      path__default['default'].posix
    );
  } else {
    options.retina.classifier || fThrowExpectField('retina.classifier');
    options.retina.targetImage || fThrowExpectField('retina.targetImage');
    options.retina.cssImageRef || fThrowExpectField('retina.cssImageRef');
  }

  options.target.css.forEach((css) => {
    css[1].format += '_retina';
  });
};

const processOptions = (rawOptions) => {
  rawOptions.src || fThrowExpectField('src');
  rawOptions.src.cwd || fThrowExpectField('src.cwd');
  rawOptions.src.glob || fThrowExpectField('src.glob');
  rawOptions.target || fThrowExpectField('target');
  rawOptions.target.css || fThrowExpectField('target.css');
  rawOptions.target.image || fThrowExpectField('target.image');

  const mergedOptions = ___default['default'].merge(
    {
      watch: false,
      src: {
        options: {},
      },
      apiOptions: {
        generateSpriteName: (fileName) =>
          path__default['default'].parse(path__default['default'].relative(mergedOptions.src.cwd, fileName)).name,
        cssImageRef: rawOptions.target.image,
        customTemplates: {},
        handlebarsHelpers: {},
      },
      spritesmithOptions: {},
      spritesheetTemplatesOptions: {},
    },
    rawOptions
  );
  mergedOptions.target.css = normalizeTargetCss(mergedOptions);
  mergedOptions.target.css.forEach((css, i) => {
    if (!css[1].format) {
      throw (
        'SpritesmithPlugin was unable to derive ' +
        `css format from extension "${path__default['default'].parse(css[0] || '').ext}" ` +
        `in "target.css[${i}]" and format was not specified explicitly`
      );
    }
  });

  ___default['default'].forEach(mergedOptions.customTemplates, (template, templateName) => {
    if (typeof template === 'string') {
      templater__default['default'].addHandlebarsTemplate(
        templateName,
        fs__default['default'].readFileSync(template, 'utf-8')
      );
    } else if (typeof template === 'function') {
      templater__default['default'].addTemplate(templateName, template);
    } else {
      throw new Error(
        'custom template can be either path/to/handlebars/template or actual template function'
      );
    }
  });

  const handlebarsHelpers = mergedOptions.apiOptions.handlebarsHelpers;
  Object.keys(handlebarsHelpers).forEach((helperKey) => {
    templater__default['default'].registerHandlebarsHelper(helperKey, handlebarsHelpers[helperKey]);
  });

  processRetinaOptions(mergedOptions);

  return mergedOptions;
};

const handler = (customOptions) => {
  const options = processOptions(customOptions);
  const { src, watch } = options;
  const init = () => {
    glob__default['default'](path__default['default'].join(src.cwd, src.glob), (err, files) => {
      if (err) {
        throw err;
      }
      compile(files, options, 'retina' in options);
    });
  };
  init();
  if (watch) {
    gaze__default['default'](src.glob, { cwd: src.cwd }, (err, watcher) => {
      watcher.on('all', init);
    });
  }
};

/**
 * entry of plugin
 * @param {{
 *    src: { cwd: string; glob: string; };
 *    target: { image: string; css: string | string[] };
 *    apiOptions: { cssImageRef: string; generateSpriteName: (image: string) => string; handlebarsHelpers: Record<string, (helperFn) => void> };
 *    spritesmithOptions: any;
 *    customTemplates: Record<string, string | () => string>;
 *    retina: { classifier: (imgpath: string) => { type: string; normalName: string; retinaName: string; }; targetImage: string; cssImageRef: string; }
 * }} customOptions
 * @returns
 */
const spritesmith = (customOptions) => {
  return {
    name: 'vite:spritesmith',
    buildStart() {
      handler(customOptions);
    },
  };
};

module.exports = spritesmith;
