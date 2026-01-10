import { defineConfig } from "vite";

export default defineConfig(() => {
  // Vercel sets these (one of them is usually present)
  const isVercel = Boolean(process.env.VERCEL);

  // GitHub Actions sets this like: "USERNAME/REPO"
  const repoFull = process.env.GITHUB_REPOSITORY || "";
  const repoName = repoFull.includes("/") ? repoFull.split("/")[1] : "";

  // If this is a user site repo (USERNAME.github.io), base must be "/"
  const isUserSite = repoName.endsWith(".github.io");

  // If repoName is missing (common on Vercel), do NOT generate "//"
  const baseForGitHubPages = isUserSite ? "/" : repoName ? `/${repoName}/` : "./";

  return {
    // For Vercel (root domain deploy), base should be "/"
    // For GitHub Pages, use the repo-based path.
    base: isVercel ? "/" : baseForGitHubPages,
  };
});
