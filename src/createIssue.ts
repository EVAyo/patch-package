import chalk from "chalk"
import open from "open"
import { stringify } from "querystring"
import { PackageManager } from "./detectPackageManager"
import { PackageDetails } from "./PackageDetails"
import { join, resolve } from "./path"

const repoSpecifier = /^([\w.-]+)\/([\w.-]+)$/
const githubURL = /github.com(:|\/)([\w.-]+\/[\w.-]+?)(.git|\/.*)?$/

type VCS =
  | {
      repo: string
      org: string
      provider: "GitHub"
    }
  | null
  | undefined

function parseRepoString(repository: string): VCS {
  if (repository.startsWith("github:")) {
    repository = repository.replace(/^github:/, "")
  }
  const urlMatch = repository.match(githubURL)
  if (urlMatch) {
    repository = urlMatch[2]
  }

  const specMatch = repository.match(repoSpecifier)

  if (!specMatch) {
    return null
  }
  const [, org, repo] = specMatch

  return { org, repo, provider: "GitHub" }
}

function getPackageVCSDetails(packageDetails: PackageDetails): VCS {
  const repository = require(resolve(join(packageDetails.path, "package.json")))
    .repository as undefined | string | { url: string }

  if (!repository) {
    return null
  }
  if (typeof repository === "string") {
    return parseRepoString(repository)
  } else if (
    typeof repository === "object" &&
    typeof repository.url === "string"
  ) {
    return parseRepoString(repository.url)
  }
}

function createIssueUrl({
  vcs,
  packageDetails,
  packageVersion,
  diff,
}: {
  vcs: VCS
  packageDetails: PackageDetails
  packageVersion: string
  diff: string
}): string {
  return `https://github.com/${vcs?.org}/${vcs?.repo}/issues/new?${stringify({
    title: "",
    body: `Hi! 👋 
      
Firstly, thanks for your work on this project! 🙂

Today I used [patch-package](https://github.com/ds300/patch-package) to patch \`${packageDetails.name}@${packageVersion}\` for the project I'm working on.

<!-- 🔺️🔺️🔺️ PLEASE REPLACE THIS BLOCK with a description of your problem, and any other relevant context 🔺️🔺️🔺️ -->

Here is the diff that solved my problem:

\`\`\`diff
${diff}
\`\`\`

<em>This issue body was [partially generated by patch-package](https://github.com/ds300/patch-package/issues/296).</em>
`,
  })}`
}

export function shouldRecommendIssue(
  vcsDetails: ReturnType<typeof getPackageVCSDetails>,
) {
  if (!vcsDetails) {
    return true
  }

  const { repo, org } = vcsDetails
  if (repo === "DefinitelyTyped" && org === "DefinitelyTyped") {
    return false
  }
  return true
}

export function maybePrintIssueCreationPrompt(
  packageDetails: PackageDetails,
  packageManager: PackageManager,
) {
  const vcs = getPackageVCSDetails(packageDetails)
  if (vcs && shouldRecommendIssue(vcs)) {
    console.log(`💡 ${chalk.bold(packageDetails.name)} is on ${
      vcs.provider
    }! To draft an issue based on your patch run

    ${packageManager === "yarn" ? "yarn" : "npx"} patch-package ${
      packageDetails.pathSpecifier
    } --create-issue
`)
  }
}

export function openIssueCreationLink({
  packageDetails,
  patchFileContents,
  packageVersion,
  patchPath,
}: {
  packageDetails: PackageDetails
  patchFileContents: string
  packageVersion: string
  patchPath: string
}) {
  const vcs = getPackageVCSDetails(packageDetails)

  if (!vcs) {
    console.error(
      `Error: Couldn't find VCS details for ${packageDetails.pathSpecifier}`,
    )
    process.exit(1)
  }

  // trim off trailing newline since we add an extra one in the markdown block
  if (patchFileContents.endsWith("\n")) {
    patchFileContents = patchFileContents.slice(0, -1)
  }

  let issueUrl = createIssueUrl({
    vcs,
    packageDetails,
    packageVersion,
    diff: patchFileContents,
  })

  const urlExceedsLimit = patchFileContents.length > 1950

  if (urlExceedsLimit) {
    const diffMessage = `<!-- 🔺️🔺️🔺️ PLEASE REPLACE THIS BLOCK with the diff contents of ${patchPath
      .split("/")
      .pop()}. 🔺️🔺️🔺️ -->`
    console.log(
      `📋 Copy the contents in [ ${patchPath} ] and paste it in the new issue's diff section.`,
    )
    issueUrl = createIssueUrl({
      vcs,
      packageDetails,
      packageVersion,
      diff: diffMessage,
    })
  }
  open(issueUrl)
}
