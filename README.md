This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## 3D Avatar (POC 3)

This project renders a 3D male avatar using TalkingHead.js.

### How to Swap or Customize the 3D Avatar GLB
To replace the default placeholder avatar with your own GLB model:
1. Obtain or export a GLB avatar model containing standard ARKit blend shapes or Oculus Visemes.
2. Place your GLB file in the `/public/avatars/` directory (e.g., `/public/avatars/me.glb`) or host it on a public CDN/HTTPS server.
3. Open `src/components/Avatar.tsx` and update the `DEFAULT_AVATAR_URL` constant:
   ```typescript
   export const DEFAULT_AVATAR_URL = "/avatars/me.glb"; // Or your remote GLB URL
   ```

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
