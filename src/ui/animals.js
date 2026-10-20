const pictures = import.meta.glob('../../assets/pic/**/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
});

const POSES = {
  rabbit: {
    pick: '토끼/토끼.png',
    smile: '토끼/토끼-웃.png',
    side: '토끼/토끼-옆.png',
    jump: '토끼/토끼-점.png',
    done: '토끼/토끼-완.png',
  },
  bear: {
    pick: '곰/곰.png',
    smile: '곰/곰-웃.png',
    side: '곰/곰-옆.png',
    jump: '곰/곰-점.png',
    done: '곰/곰-완.png',
  },
  dog: {
    pick: '강아지/강아지.png',
    smile: '강아지/강-웃.png',
    side: '강아지/강-옆.png',
    jump: '강아지/강-점.png',
    done: '강아지/강-완.png',
  },
  squirrel: {
    pick: '다람쥐/다람쥐.png',
    smile: '다람쥐/다-웃.png',
    side: '다람쥐/다-옆.png',
    jump: '다람쥐/다-점.png',
    done: '다람쥐/다-완.png',
  },
  turtle: {
    pick: '거북이/거북이.png',
    smile: '거북이/거-웃.png',
    side: '거북이/거-옆.png',
    jump: '거북이/거-점.png',
    done: '거북이/거-완.png',
  },
  penguin: {
    pick: '펭귄/펭귄.png',
    smile: '펭귄/펭-웃.png',
    side: '펭귄/평-옆.png',
    jump: '펭귄/펭-점.png',
    done: '펭귄/펭-완.png',
  },
};

function urlFor(fileTail) {
  const tail = String(fileTail).replaceAll('\\', '/');
  const key = Object.keys(pictures).find((path) => path.replaceAll('\\', '/').endsWith(tail));
  return key ? pictures[key] : '';
}

export function animalUrl(kind, pose = 'pick') {
  const files = POSES[kind] || POSES.rabbit;
  return urlFor(files[pose] || files.pick);
}

export function animalImg(kind, pose = 'pick') {
  return `<img class="animal-img" alt="" data-pose="${pose}" src="${animalUrl(kind, pose)}" />`;
}

export function poseForStep({ reached, goal, jumping }) {
  if (jumping) return 'jump';
  if (reached >= goal) return 'done';
  if (reached <= 0) return 'smile';
  return 'side';
}

export function randomBackgroundUrl() {
  const keys = Object.keys(pictures).filter((path) => path.replaceAll('\\', '/').includes('/배경/배경'));
  if (!keys.length) return '';
  const key = keys[Math.floor(Math.random() * keys.length)];
  return pictures[key];
}
