import gaze from 'gaze';
import glob from 'glob';
import path from 'path';
import compile from './lib/compile';
import processOptions from './lib/processOption';

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
