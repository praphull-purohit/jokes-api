# Official Joke API

> This is a fork of [15Dkatz/official_joke_api](https://github.com/15Dkatz/official_joke_api) by David Katz,
> which is now archived. The original ran at `official-joke-api.appspot.com`. This fork keeps the same API
> and serves it from Cloudflare Workers at **https://api.app-jokes.workers.dev**. The original jokes and
> code are used under the [MIT licence](LICENCE).

## Endpoints:

### Grab a random joke
[https://api.app-jokes.workers.dev/random_joke](https://api.app-jokes.workers.dev/random_joke)


[https://api.app-jokes.workers.dev/jokes/random](https://api.app-jokes.workers.dev/jokes/random)

### Get joke types
[https://api.app-jokes.workers.dev/types](https://api.app-jokes.workers.dev/types)

### Grab ten random jokes
[https://api.app-jokes.workers.dev/random_ten](https://api.app-jokes.workers.dev/random_ten)


[https://api.app-jokes.workers.dev/jokes/ten](https://api.app-jokes.workers.dev/jokes/ten)

### Grab any number of random jokes

Usage: `https://api.app-jokes.workers.dev/jokes/random/<any-number>`

For example:
* [https://api.app-jokes.workers.dev/jokes/random/5](https://api.app-jokes.workers.dev/jokes/random/5)
* [https://api.app-jokes.workers.dev/jokes/random/25](https://api.app-jokes.workers.dev/jokes/random/25)
* [https://api.app-jokes.workers.dev/jokes/random/250](https://api.app-jokes.workers.dev/jokes/random/250)

### Grab jokes by type

The endpoints are `jokes/:type/random` or `jokes/:type/ten`. For example:

[https://api.app-jokes.workers.dev/jokes/programming/random](https://api.app-jokes.workers.dev/jokes/programming/random)

[https://api.app-jokes.workers.dev/jokes/programming/ten](https://api.app-jokes.workers.dev/jokes/programming/ten)


### Grab joke by id

Use endpoint `/jokes/:id`

### Rate limit

Each IP can make about 100 requests per minute. After that, the API answers with `429` and a JSON error.

***

## How these jokes were collected

The majority of these jokes were contributed by joke-loving coders around the world!

### Make a contribution!

Submit a Pull Request, with your joke added to the jokes/index.json file. Make sure the joke is in this format:

```javascript
{
  "type": "programming",
  "setup": "What's the best thing about a Boolean?",
  "punchline": "Even if you're wrong, you're only off by a bit."
}
```

***

### Run Locally
* Clone the repo
* Use Node 26 (see `.nvmrc`)
* `npm i && npm run dev`
* Visit `localhost:8787/jokes/random` or `localhost:8787/jokes/ten` on your browser
* Run the tests with `npm test`, and check a running server with `scripts/smoke.sh http://localhost:8787`

### Deploy

The API runs as a [Cloudflare Worker](https://developers.cloudflare.com/workers/), configured in `wrangler.jsonc`.
GitHub Actions runs the tests on every pull request and deploys every push to `main`. The deploy needs two repository
secrets: `CLOUDFLARE_API_TOKEN` (a token from the "Edit Cloudflare Workers" template) and `CLOUDFLARE_ACCOUNT_ID`.

To deploy by hand, run `npx wrangler login` once, then `npm run deploy`.
