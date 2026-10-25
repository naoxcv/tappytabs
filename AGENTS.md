<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

## Demo Convex deployment

The shared demo deployment is the Convex production deployment at `https://oceanic-canary-660.convex.cloud/`. Before deploying, read `convex/_generated/ai/guidelines.md` and run the Convex typecheck.

Use a deploy key associated with `oceanic-canary-660` explicitly. `little-poodle-742` is not this project’s demo deployment and must never be used for this workflow. A plain `npx convex deploy` always resolves to the project default production deployment, so it is unsafe for this demo.

Deploy backend code without replacing demo data:

```bash
npm run typecheck
CONVEX_DEPLOY_KEY=<oceanic-canary-660-deploy-key> npm run deploy:demo -- --skip-seed
```

Do not substitute `CONVEX_DEPLOYMENT=prod:oceanic-canary-660`; that selects the current development context but does not retarget `npx convex deploy` away from the project default. If the deploy key is unavailable, stop and request it rather than risking a deploy to `little-poodle-742`.

The plain `npm run deploy:demo` command also runs `seedActions:baseAndIngest --prod`, which wipes and recreates demo data. Run that only when a demo data reset is explicitly intended. After deployment, verify the production/demo logs with `npx convex logs --deployment prod --history 20` and confirm the app is configured with `https://oceanic-canary-660.convex.cloud/`.
