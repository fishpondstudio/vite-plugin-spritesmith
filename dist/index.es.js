import gaze from 'gaze';
import glob from 'glob';
import path from 'path';
import _ from 'lodash';
import templater from 'spritesheet-templates';
import spritesmith$1 from 'spritesmith';
import mkdirp from 'mkdirp';
import fs from 'fs-extra';

const promiseCall = (fn, ...args) =>
  new Promise((resolve, reject) =>
    fn(...args, (err, result) => (err ? reject(err) : resolve(result)))
  );

const writeFileR = async (...args) => {
  const fileName = args[0];
  await mkdirp(path.dirname(fileName));
  return fs.writeFile(...args);
};

const sendToPast = (fileName, bypass) => {
  if (bypass) return Promise.resolve();
  return fs.utimes(
    fileName,
    new Date(Date.now() - 10000),
    new Date(Date.now() - 10000)
  );
};

const writeCss = async (sources, templaterData) => {
	return await Promise.all(
		sources.map(async (css) => {
			const fileName = css[0];
			const code = templater(templaterData, css[1]);
			await writeFileR(fileName, code);
			await sendToPast(fileName);

			return fileName;
		}),
	);
};
const spriteSheetFormat = (spritesmithResult, options) => {
	const generateSpriteName = options.apiOptions.generateSpriteName
		? options.apiOptions.generateSpriteName
		: (fileName) => {
				return path.parse(path.relative(options.src.cwd, fileName)).name;
		  };
	const sprites = _.map(
		spritesmithResult.coordinates,
		(oneSourceInfo, fileName) =>
			_.assign({ name: generateSpriteName(fileName) }, oneSourceInfo),
	);
	const spritesheet = _.assign(
		{ image: options.apiOptions.cssImageRef },
		spritesmithResult.properties,
	);

	return {
		sprites: sprites,
		spritesheet: spritesheet,
		spritesheet_info: options.apiOptions.spritesheet_info,
	};
};

const compileNormal = (files, options) => {
	const { target } = options;
	spritesmith$1.run(
		_.merge({}, { src: files }, options.spritesmithOptions),
		(err, result) => {
			if (err) {
				throw err;
			}
			const spritesheetTemplatesData = spriteSheetFormat(result, options);
			// write the sprite image file and stylesheet
			Promise.all([
				writeFileR(target.image, result.image, "binary"),
				writeCss(target.css, spritesheetTemplatesData),
			]);
		},
	);
};

function getSpritesForSpritesheetTemplates(
	combinedSources,
	prefix,
	field,
	sourceField,
) {
	return _.map(combinedSources, (sprite) => ({
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
		const oneRecord = retina.classifier(path.resolve(src.cwd, fileName));
		return {
			...oneRecord,
			apiName: apiOptions.generateSpriteName(oneRecord.normalName),
		};
	});

	const combinedSources = _.map(
		_.groupBy(sourceRecords, "apiName"),
		(group) => {
			const result = _.clone(group[0]);
			group.forEach((oneRecord) => {
				result[oneRecord.type] = true;
			});
			return result;
		},
	);

	const results = await Promise.all([
		promiseCall(
			spritesmith$1.run.bind(spritesmith$1, {
				...spritesmithOptions,
				src: _.map(combinedSources, "normalName"),
			}),
		),
		promiseCall(
			spritesmith$1.run.bind(spritesmith$1, {
				...spritesmithOptions,
				src: _.map(combinedSources, "retinaName"),
				padding: (spritesmithOptions.padding || 0) * 2,
			}),
		),
	]);

	combinedSources.forEach((oneSource) => {
		oneSource.normalCoordinates = results[0].coordinates[oneSource.normalName];
		oneSource.retinaCoordinates = results[1].coordinates[oneSource.retinaName];
	});

	const normalSprites = getSpritesForSpritesheetTemplates(
		combinedSources,
		"",
		"normalCoordinates",
		"normalName",
	);
	const retinaSprites = getSpritesForSpritesheetTemplates(
		combinedSources,
		"retina_",
		"retinaCoordinates",
		"retinaName",
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
		writeFileR(target.image, results[0].image, "binary"),
		writeFileR(retina.targetImage, results[1].image, "binary"),
		writeCss(target.css, spritesheetTemplatesData),
	]);
};

const compile = (files, options, useRetina = false) => {
	const compileStrategy = useRetina ? compileRetina : compileNormal;
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
  MINE_TYPES[path.parse(cssFileName).ext];

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

    r.targetImage = addSuffixToFileName(suffix, options.target.image, path);
    r.cssImageRef = addSuffixToFileName(
      suffix,
      options.apiOptions.cssImageRef,
      path.posix
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

  const mergedOptions = _.merge(
    {
      watch: false,
      src: {
        options: {},
      },
      apiOptions: {
        generateSpriteName: (fileName) =>
          path.parse(path.relative(mergedOptions.src.cwd, fileName)).name,
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
        `css format from extension "${path.parse(css[0] || '').ext}" ` +
        `in "target.css[${i}]" and format was not specified explicitly`
      );
    }
  });

  _.forEach(mergedOptions.customTemplates, (template, templateName) => {
    if (typeof template === 'string') {
      templater.addHandlebarsTemplate(
        templateName,
        fs.readFileSync(template, 'utf-8')
      );
    } else if (typeof template === 'function') {
      templater.addTemplate(templateName, template);
    } else {
      throw new Error(
        'custom template can be either path/to/handlebars/template or actual template function'
      );
    }
  });

  const handlebarsHelpers = mergedOptions.apiOptions.handlebarsHelpers;
  Object.keys(handlebarsHelpers).forEach((helperKey) => {
    templater.registerHandlebarsHelper(helperKey, handlebarsHelpers[helperKey]);
  });

  processRetinaOptions(mergedOptions);

  return mergedOptions;
};

const handler = (customOptions) => {
  const options = processOptions(customOptions);
  const { src, watch } = options;
  const init = () => {
    glob(path.posix.join(src.cwd, src.glob), (err, files) => {
      if (err) {
        throw err;
      }
      compile(files, options, 'retina' in options);
    });
  };
  init();
  if (watch) {
    gaze(src.glob, { cwd: src.cwd }, (err, watcher) => {
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

export default spritesmith;
