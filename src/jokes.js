import data from '../jokes/index.json' with { type: 'json' };

export const jokes = data.map((joke, index) => ({ ...joke, id: index + 1 }));

export const count = jokes.length;

export const types = [...new Set(jokes.map((joke) => joke.type))];

export const randomJoke = () => jokes[Math.floor(Math.random() * count)];

/**
 * Get N distinct random jokes from a jokeArray, or all of them if it holds fewer than N.
 */
export const randomN = (jokeArray, n) => {
  const limit = Math.min(jokeArray.length, n);
  const randomIndices = new Set();

  while (randomIndices.size < limit) {
    randomIndices.add(Math.floor(Math.random() * jokeArray.length));
  }

  return [...randomIndices].map((index) => jokeArray[index]);
};

export const randomTen = () => randomN(jokes, 10);

export const randomSelect = (number) => randomN(jokes, number);

export const jokeByType = (type, n) => randomN(jokes.filter((joke) => joke.type === type), n);

/**
 * @param {number} id - joke id
 * @returns a single joke object or undefined
 */
export const jokeById = (id) => (Number.isInteger(id) ? jokes[id - 1] : undefined);
