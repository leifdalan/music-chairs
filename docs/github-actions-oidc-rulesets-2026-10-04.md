# GitHub Actions OIDC, workflow permissions and concurrency, and rulesets — excerpts

Verbatim excerpts from the source of GitHub's documentation (github/docs, commit 2bd66de8cea336061c9ea060c9b37385136e6ab3), retrieved 2026-10-04. Copyright GitHub, Inc., licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/). Liquid tags (`{% ... %}`) are left as they appear in the source; the published pages substitute them. Site-relative links, and in-page links to sections not excerpted, are written as absolute https://docs.github.com/en/ links. Excerpts are separated by `---` and introduced by their source file and line range; nothing else is changed.

---

Source: https://github.com/github/docs/blob/2bd66de8cea336061c9ea060c9b37385136e6ab3/content/actions/reference/security/oidc.md (lines 100–187)

## OIDC claims used to define trust conditions on cloud roles

Audience and subject claims are typically used in combination while setting conditions on the cloud role/resources to scope its access to the {% data variables.product.github %} workflows.
* **Audience:** By default, this value uses the URL of the organization or repository owner. This can be used to set a condition that only the workflows in the specific organization can access the cloud role.
* **Subject:** By default, has a predefined format and is a concatenation of some of the key metadata about the workflow, such as the {% data variables.product.prodname_dotcom %} organization, repository, branch, or associated [`job`](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#jobsjob_idenvironment) environment. See [Example subject claims](#example-subject-claims) to see how the subject claim is assembled from concatenated metadata.

If you need more granular trust conditions, you can customize the {% ifversion ghec %}issuer (`iss`) and {% endif %}subject (`sub`) claim{% ifversion ghec %}s that are{% else %} that's{% endif %} included with the JWT. For more information, see [Customizing the token claims](https://docs.github.com/en/actions/reference/security/oidc#customizing-the-token-claims).

There are also many additional claims supported in the OIDC token that can be used for setting these conditions. In addition, your cloud provider could allow you to assign a role to the access tokens, letting you specify even more granular permissions.

{% ifversion dependabot-oidc-support %}

OIDC tokens requested for {% data variables.product.prodname_dependabot %} update jobs have an `event_name` claim of `dynamic`. If your trust policy is intended to authorize only {% data variables.product.prodname_actions %} workflows and your cloud provider supports conditions on `event_name`, allow only the event names expected by your workflows.

{% endif %}

> [!NOTE]
> To control how your cloud provider issues access tokens, you **must** define at least one condition, so that untrusted repositories can’t request access tokens for your cloud resources.

## Example subject claims

The following examples demonstrate how to use "Subject" as a condition, and explain how the "Subject" is assembled from concatenated metadata. The [subject](https://openid.net/specs/openid-connect-core-1_0.html#StandardClaims) uses information from the [`job` context](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts#job-context), and instructs your cloud provider that access token requests may only be granted for requests from workflows running in specific branches, environments. The following sections describe some common subjects you can use.

### Filtering for a specific environment

The subject claim includes the environment name when the job references an environment.

You can configure a subject that filters for a specific [environment](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments) name. In this example, the workflow run must have originated from a job that has an environment named `Production`, in a repository named `octo-repo` that is owned by the `octo-org` organization:

* Syntax: `repo:ORG-NAME/REPO-NAME:environment:ENVIRONMENT-NAME`
* Example: `repo:octo-org/octo-repo:environment:Production`

### Filtering for `pull_request` events

The subject claim includes the `pull_request` string when the workflow is triggered by a pull request event, but only if the job doesn't reference an environment.

You can configure a subject that filters for the [`pull_request`](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request) event. In this example, the workflow run must have been triggered by a `pull_request` event in a repository named `octo-repo` that is owned by the `octo-org` organization:

* Syntax: `repo:ORG-NAME/REPO-NAME:pull_request`
* Example: `repo:octo-org/octo-repo:pull_request`

### Filtering for a specific branch

The subject claim includes the branch name of the workflow, but only if the job doesn't reference an environment, and if the workflow is not triggered by a pull request event.

You can configure a subject that filters for a specific branch name. In this example, the workflow run must have originated from a branch named `demo-branch`, in a repository named `octo-repo` that is owned by the `octo-org` organization:

* Syntax:  `repo:ORG-NAME/REPO-NAME:ref:refs/heads/BRANCH-NAME`
* Example: `repo:octo-org/octo-repo:ref:refs/heads/demo-branch`

### Filtering for a specific tag

The subject claim includes the tag name of the workflow, but only if the job doesn't reference an environment, and if the workflow is not triggered by a pull request event.

You can create a subject that filters for specific tag. In this example, the workflow run must have originated with a tag named `demo-tag`, in a repository named `octo-repo` that is owned by the `octo-org` organization:

* Syntax: `repo:ORG-NAME/REPO-NAME:ref:refs/tags/TAG-NAME`
* Example: `repo:octo-org/octo-repo:ref:refs/tags/demo-tag`

{% ifversion fpt or ghec or ghes > 3.18 %}

### Filtering for metadata containing `:`

Any `:` within the metadata values will be replaced with `%3A` in the subject claim.

You can configure a subject that includes metadata containing colons. In this example, the workflow run must have originated from a job that has an environment named `Production:V1`, in a repository named `octo-repo` that is owned by the `octo-org` organization:

* Syntax: `repo:ORG-NAME/REPO-NAME:environment:ENVIRONMENT-NAME`
* Example: `repo:octo-org/octo-repo:environment:Production%3AV1`

{% endif %}

## Immutable subject claims

The OpenID Connect (OIDC) specification requires subject (`sub`) claims to be locally unique and never reassigned. Previously, the default `sub` format used only organization and repository names. If a namespace was recycled, a different owner could create the same subject value.

To help prevent this scenario, repositories created after July 15, 2026 now use an immutable default subject format that includes both the owner ID and repository ID. This rollout does not include {% data variables.product.prodname_ghe_server %}.

* Syntax: `repo:OWNER@OWNER-ID/REPO@REPO-ID:ref:refs/heads/BRANCH`
* Previous format example: `repo:octo-org/octo-repo:ref:refs/heads/main`
* Immutable format example: `repo:octo-org@123456/octo-repo@456789:ref:refs/heads/main`

The `@` separator is used between names and IDs because `@` cannot appear in {% data variables.product.github %} usernames or repository names.

Repositories created before July 15, 2026 keep the previous format unless you opt in to immutable subject claims. You can opt in at the organization or repository level by using the OIDC settings UI or REST API.

Repository renames and transfers after July 15, 2026 also move to the immutable subject format.

---

Source: https://github.com/github/docs/blob/2bd66de8cea336061c9ea060c9b37385136e6ab3/content/actions/reference/security/oidc.md (lines 556–592)

## Workflow permissions for the requesting the OIDC token

### Required permission

* The job or workflow must grant the [`id-token: write`](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#permissions) permission to allow {% data variables.product.github %}'s OIDC provider to create a JSON Web Token (JWT):

  ```yaml
  permissions:
    id-token: write
  ```

* Without `id-token: write`, the OIDC JWT ID token cannot be requested. This setting only enables fetching and setting the OIDC token; it does not grant write access to other resources.

### Setting permissions

* To fetch an OIDC token for a workflow, set the permission at the workflow level:

  ```yaml
  permissions:
    id-token: write # This is required for requesting the JWT
    contents: read # This is required for actions/checkout
  ```

* To fetch an OIDC token for a single job, set the permission within that job:

  ```yaml
  permissions:
    id-token: write # This is required for requesting the JWT
  ```

* Additional permissions may be required depending on workflow needs.

### Reusable workflows

* For reusable workflows owned by the same user, organization, or enterprise as the caller, the OIDC token generated in the reusable workflow is accessible from the caller's context.
* For reusable workflows outside your enterprise or organization, set the `permissions` setting for `id-token` to `write` explicitly at the caller workflow or job level. This ensures the OIDC token is only available to intended caller workflows.

---

Source: https://github.com/github/docs/blob/2bd66de8cea336061c9ea060c9b37385136e6ab3/content/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws.md (lines 48–171)

## Adding the identity provider to AWS

To add the {% data variables.product.prodname_dotcom %} OIDC provider to IAM, see the [AWS documentation](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_providers_create_oidc.html).

* For the provider URL: Use {% ifversion ghes %}`https://HOSTNAME/_services/token`{% else %}`https://token.actions.githubusercontent.com`{% endif %}
* For the "Audience": Use `sts.amazonaws.com` if you are using the [official action](https://github.com/aws-actions/configure-aws-credentials).

### Configuring the role and trust policy

To configure the role and trust in IAM, see the AWS documentation [Configure AWS Credentials for GitHub Actions](https://github.com/aws-actions/configure-aws-credentials#configure-aws-credentials-for-github-actions) and [Configuring a role for GitHub OIDC identity provider](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_create_for-idp_oidc.html#idp_oidc_Create_GitHub).

> [!NOTE]
> AWS Identity and Access Management (IAM) recommends that users evaluate the IAM condition key, `token.actions.githubusercontent.com:sub`, in the trust policy of any role that trusts {% data variables.product.prodname_dotcom %}’s OIDC identity provider (IdP). Evaluating this condition key in the role trust policy limits which {% data variables.product.prodname_dotcom %} actions are able to assume the role.

Edit the trust policy, adding the `sub` field to the validation conditions. For example:

```json copy
"Condition": {
  "StringEquals": {
    "{% ifversion ghes %}HOSTNAME/_services/token{% else %}token.actions.githubusercontent.com{% endif %}:aud": "sts.amazonaws.com",
    "{% ifversion ghes %}HOSTNAME/_services/token{% else %}token.actions.githubusercontent.com{% endif %}:sub": "repo:octo-org/octo-repo:ref:refs/heads/octo-branch"
  }
}
```

For repositories created after July 15, 2026, or that have opted in to immutable subject claims, the `sub` claim includes immutable owner and repository IDs (not available on {% data variables.product.prodname_ghe_server %}). Make sure your trust policy matches the format your repository uses. For more information, see [AUTOTITLE](https://docs.github.com/en/actions/reference/security/oidc#immutable-subject-claims).

```json copy
"Condition": {
  "StringEquals": {
    "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
    "token.actions.githubusercontent.com:sub": "repo:octo-org@123456/octo-repo@456789:ref:refs/heads/octo-branch"
  }
}
```

If you use a workflow with an environment, the `sub` field must reference the environment name: `repo:ORG-NAME/REPO-NAME:environment:ENVIRONMENT-NAME`. For more information, see [AUTOTITLE](https://docs.github.com/en/actions/reference/security/oidc#filtering-for-a-specific-environment).

{% data reusables.actions.oidc-deployment-protection-rules %}

```json copy
"Condition": {
  "StringEquals": {
    "{% ifversion ghes %}HOSTNAME/_services/token{% else %}token.actions.githubusercontent.com{% endif %}:aud": "sts.amazonaws.com",
    "{% ifversion ghes %}HOSTNAME/_services/token{% else %}token.actions.githubusercontent.com{% endif %}:sub": "repo:octo-org/octo-repo:environment:prod"
  }
}
```

In the following example, `StringLike` is used with a wildcard operator (`*`) to allow any branch, pull request merge branch, or environment from the `octo-org/octo-repo` organization and repository to assume a role in AWS.

```json copy
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Federated": "arn:aws:iam::123456123456:oidc-provider/token.actions.githubusercontent.com"
            },
            "Action": "sts:AssumeRoleWithWebIdentity",
            "Condition": {
                "StringLike": {
                    "token.actions.githubusercontent.com:sub": "repo:octo-org/octo-repo:*"
                },
                "StringEquals": {
                    "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
                }
            }
        }
    ]
}
```

## Updating your {% data variables.product.prodname_actions %} workflow

To update your workflows for OIDC, you will need to make two changes to your YAML:
1. Add permissions settings for the token.
1. Use the [`aws-actions/configure-aws-credentials`](https://github.com/aws-actions/configure-aws-credentials) action to exchange the OIDC token (JWT) for a cloud access token.

### Adding permissions settings

{% data reusables.actions.oidc-permissions-token %}

### Requesting the access token

The `aws-actions/configure-aws-credentials` action receives a JWT from the {% data variables.product.prodname_dotcom %} OIDC provider, and then requests an access token from AWS. For more information, see the AWS [documentation](https://github.com/aws-actions/configure-aws-credentials).

* `BUCKET-NAME`: Replace this with the name of your S3 bucket.
* `AWS-REGION`: Replace this with the name of your AWS region.
* `ROLE-TO-ASSUME`: Replace this with your AWS role. For example, `arn:aws:iam::1234567890:role/example-role`

```yaml copy
# Sample workflow to access AWS resources when workflow is tied to branch
# The workflow creates a static website using Amazon S3
{% data reusables.actions.actions-not-certified-by-github-comment %}
name: AWS example workflow
on:
  push
env:
  BUCKET_NAME : "BUCKET-NAME"
  AWS_REGION : "AWS-REGION"
# permission can be added at job level or workflow level
permissions:
  id-token: write   # This is required for requesting the JWT
  contents: read    # This is required for actions/checkout
jobs:
  S3PackageUpload:
    runs-on: ubuntu-latest
    steps:
      - name: Git clone the repository
        uses: {% data reusables.actions.action-checkout %}
      - name: configure aws credentials
        uses: aws-actions/configure-aws-credentials@e3dd6a429d7300a6a4c196c26e071d42e0343502
        with:
          role-to-assume: ROLE-TO-ASSUME
          role-session-name: samplerolesession
          aws-region: {% raw %}${{ env.AWS_REGION }}{% endraw %}
      # Upload a file to AWS s3
      - name: Copy index.html to s3
        run: |
          aws s3 cp ./index.html s3://{% raw %}${{ env.BUCKET_NAME }}{% endraw %}/
```

---

Source: https://github.com/github/docs/blob/2bd66de8cea336061c9ea060c9b37385136e6ab3/content/actions/reference/workflows-and-actions/workflow-syntax.md (lines 340–371)

## `permissions`

{% data reusables.actions.jobs.section-assigning-permissions-to-jobs %}

### Defining access for the `GITHUB_TOKEN` scopes

{% data reusables.actions.github-token-available-permissions %}

#### Changing the permissions in a forked repository

{% data reusables.actions.forked-write-permission %}

### How permissions are calculated for a workflow job

The permissions for the `GITHUB_TOKEN` are initially set to the default setting for the enterprise, organization, or repository. If the default is set to the restricted permissions at any of these levels then this will apply to the relevant repositories. For example, if you choose the restricted default at the organization level then all repositories in that organization will use the restricted permissions as the default. The permissions are then adjusted based on any configuration within the workflow file, first at the workflow level and then at the job level. Finally, if the workflow was triggered by a pull request event other than `pull_request_target` from a forked repository, and the **Send write tokens to workflows from pull requests** setting is not selected, the permissions are adjusted to change any write permissions to read only.

### Setting the `GITHUB_TOKEN` permissions for all jobs in a workflow

You can specify `permissions` at the top level of a workflow, so that the setting applies to all jobs in the workflow.

#### Example: Setting the `GITHUB_TOKEN` permissions for an entire workflow

{% data reusables.actions.jobs.setting-permissions-all-jobs-example %}

### Using the `permissions` key for forked repositories

You can use the `permissions` key to add and remove `read` permissions for forked repositories, but typically you can't grant `write` access. The exception to this behavior is where an admin user has selected the **Send write tokens to workflows from pull requests** option in the {% data variables.product.prodname_actions %} settings. For more information, see [AUTOTITLE](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository#enabling-workflows-for-forks-of-private-repositories).

### Permissions for workflow runs triggered by {% data variables.product.prodname_dependabot %}

{% data reusables.actions.workflow-runs-dependabot-note %}

---

Source: https://github.com/github/docs/blob/2bd66de8cea336061c9ea060c9b37385136e6ab3/content/actions/reference/workflows-and-actions/workflow-syntax.md (lines 403–408)

## `concurrency`

{% data reusables.actions.jobs.section-using-concurrency %}

{% ifversion actions-cache-mode %}

---

Source: https://github.com/github/docs/blob/2bd66de8cea336061c9ea060c9b37385136e6ab3/content/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets.md (lines 33–36)

## Restrict deletions

If selected, only users with bypass permissions can delete branches or tags whose name matches the pattern you specify. This rule is selected by default.

---

Source: https://github.com/github/docs/blob/2bd66de8cea336061c9ea060c9b37385136e6ab3/content/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets.md (lines 101–132)

## Require a pull request before merging

You can require that all changes to the target branch be associated with a pull request. The pull request doesn't necessarily have to be approved, but it must be opened.

### Additional settings

{% data reusables.pull_requests.security-changes-mergeability %}

{% data reusables.pull_requests.required-reviews-for-prs-summary %}

If you enable required reviews, collaborators can only push changes to a branch via a pull request that is approved by the required number of reviewers with write permissions.

If someone chooses the **Request changes** option in a review, then that person must approve the pull request before the pull request can be merged. If a reviewer who requests changes on a pull request isn't available, anyone with write permissions for the repository can dismiss the blocking review.

{% data reusables.repositories.review-policy-overlapping-commits %}

Optionally, you can choose to dismiss stale pull request approvals when commits are pushed that affect the diff in the pull request. {% data variables.product.company_short %} records the state of the diff at the point when a pull request is approved. This state represents the set of changes that the reviewer approved. If the diff changes from this state (for example, because a contributor pushes new changes to the pull request branch or clicks **Update branch**, or because a related pull request is merged into the target branch), the approving review is dismissed as stale, and the pull request cannot be merged until someone approves the work again. For information about the target branch, see [AUTOTITLE](https://docs.github.com/en/pull-requests/reference/pull-requests).

Optionally, you can choose to require reviews from code owners. If you do, any pull request that modifies content with a code owner must be approved by that code owner before the pull request can be merged into the protected branch. Note that if code has multiple owners, an approval from _any_ of the code owners will be sufficient to meet this requirement. For more information, see [AUTOTITLE](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners).

Optionally, you can restrict who can dismiss pull request reviews. If you enable this setting, select the users, teams, or {% data variables.product.prodname_github_apps %} that can dismiss reviews on branches targeted by the ruleset. You can configure this setting in the UI or through the REST API or GraphQL API. For more information, see [AUTOTITLE](https://docs.github.com/en/pull-requests/how-tos/review-pull-requests/dismissing-a-pull-request-review).

Optionally, you can require an approval from someone other than the last person to push to a branch before a pull request can be merged. This means at least one other authorized reviewer has approved any changes. For example, the "last reviewer" can check that the latest set of changes incorporates feedback from other reviews, and does not add new, unreviewed content.

For complex pull requests that require many reviews, requiring an approval from someone other than the last person to push can be a compromise that avoids the need to dismiss all stale reviews: with this option, "stale" reviews are not dismissed, and the pull request remains approved as long as someone other than the person who made the most recent changes approves it. Users who have already reviewed a pull request can reapprove after the most recent push to meet this requirement. If you are concerned about pull requests being "hijacked" (where unapproved content is added to approved pull requests), it is safer to dismiss stale reviews.

Optionally, you can require all comments on the pull request to be resolved before it can be merged to a branch. This ensures that all comments are addressed or acknowledged before merge.

Optionally, you can require a merge type of merge, squash, or rebase. This means the targeted branches may only be merged based on the allowed type. Additionally if the repository has disabled a merge method and the ruleset required a different method, the merge will be blocked. See [AUTOTITLE](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/about-merge-methods-on-github).

{% ifversion repo-rules-copilot-extra-approval %}

---

Source: https://github.com/github/docs/blob/2bd66de8cea336061c9ea060c9b37385136e6ab3/content/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets.md (lines 170–213)

## Require status checks to pass before merging

Required status checks ensure that all required CI tests are passing before collaborators can make changes to a branch or tag targeted by your ruleset. Required status checks can be checks or statuses. For more information, see [AUTOTITLE](https://docs.github.com/en/pull-requests/reference/status-checks).

You can use the commit status API to allow external services to mark commits with an appropriate status. For more information, see [AUTOTITLE](https://docs.github.com/en/rest/commits/statuses).

After enabling required status checks, all required status checks must pass before collaborators can merge changes into the branch or tag. {% ifversion repo-rules-ignorecheck %} Optionally, you can select "Do not require status checks on creation" if you wish to allow branch creation regardless of the status check result. {% endif %}

Any person or integration with write permissions to a repository can set the state of any status check in the repository, but in some cases you may only want to accept a status check from a specific {% data variables.product.prodname_github_app %}. When you add a required status check rule, you can select an app as the expected source of status updates. The app must be installed in the repository with the `statuses:write` permission, must have recently submitted a check run, and must be associated with a pre-existing required status check in the ruleset. If the status is set by any other person or integration, merging won't be allowed. If you select "any source," you can still manually verify the author of each status, listed in the merge box.

To troubleshoot issues with configuring status checks in rulesets, see [AUTOTITLE](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/troubleshooting-rules#troubleshooting-required-status-checks).

{% ifversion repo-rules-enterprise %}

> [!NOTE] For organization-level status checks, the app must be installed with the `statuses:write` permission. Only apps with this permission are displayed when configuring rulesets at the organization-level.

{% endif %}

You can think of required status checks as being either "loose" or "strict." The type of required status check you choose determines whether your branch is required to be up to date with the base branch before merging.

| Type of required status check | Setting | Merge requirements | Considerations |
| --- | --- | --- | --- |
| **Strict** | The **Require branches to be up to date before merging** checkbox is checked. | The topic branch **must** be up to date with the base branch before merging. | This is the default behavior for required status checks. More builds may be required, as you'll need to bring the head branch up to date after other collaborators update the target branch.|
| **Loose** | The **Require branches to be up to date before merging** checkbox is **not** checked. | The branch **does not** have to be up to date with the base branch before merging. | You'll have fewer required builds, as you won't need to bring the head branch up to date after other collaborators merge pull requests. Status checks may fail after you merge your branch if there are incompatible changes with the base branch. |
| **Disabled** | The **Require status checks to pass before merging** checkbox is **not** checked. | The branch has no merge restrictions. | If required status checks aren't enabled, collaborators can merge the branch at any time, regardless of whether it is up to date with the base branch. This increases the possibility of incompatible changes.

For status check troubleshooting information, see [AUTOTITLE](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks).

## Block force pushes

You can prevent users from force pushing to the targeted branches or tags. This rule is enabled by default.

If someone force pushes to a branch or tag, commits that other collaborators have based their work on may be removed from the history of the branch or tag. This may lead to merge conflicts or corrupted pull requests. Force pushing can also be used to delete branches or point a branch to commits that were not approved in a pull request.

> [!NOTE] If force pushes are blocked, organization owners or repository administrators will be unable to change or rename the default branch unless they are authorized to bypass the ruleset.

Enabling force pushes will not override any other rules. For example, if a branch requires a linear commit history, you cannot force push merge commits to that branch.

{% ifversion ghes %}You cannot enable force pushes for a branch if a site administrator has blocked force pushes to all branches in your repository. For more information, see [AUTOTITLE](https://docs.github.com/en/admin/enforcing-policies/enforcing-policies-for-your-enterprise/enforcing-repository-management-policies-in-your-enterprise).

If a site administrator has blocked force pushes to the default branch only, you can still enable force pushes for any other branch or tag.{% endif %}

{% ifversion secret-scanning-merge-protection %}
