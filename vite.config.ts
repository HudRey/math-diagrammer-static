import { defineConfig } from "vite";

export default defineConfig(() => {
  // On GitHub Actions, this env var is like: "USERNAME/REPO"
  const repoFull = process.env.GITHUB_REPOSITORY || "";
  const repoName = repoFull.includes("/") ? repoFull.split("/")[1] : "";

  // If this is a user site repo (USERNAME.github.io), base must be "/"
  const isUserSite = repoName.endsWith(".github.io");

  return {
    base: isUserSite ? "/" : `/${repoName}/`,
  };
});
