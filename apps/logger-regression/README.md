# AgentILS Logger Regression

Interactive and automated regression harness for `@agent-ils/logger`.

## Run The App

```sh
pnpm --filter agentils-logger-regression dev
```

Open the Vite URL, then run mock scenarios without any collector. To exercise
the live scenarios, start a collector in another terminal:

```sh
npx @agent-ils/logger serve --cwd apps/logger-regression
```

## Run Automated Tests

```sh
pnpm --filter agentils-logger-regression test
pnpm --filter agentils-logger-regression typecheck
pnpm --filter agentils-logger-regression build
```

The automated tests import the logger source directly so they do not race with
`@agent-ils/logger` package builds that clean `dist/` during root `turbo test`.
