export interface GitHubOwnerResponse {
  readonly id: number;
  readonly login: string;
  readonly avatar_url: string;
  readonly html_url: string;
  readonly type: "User" | "Organization";
}

export interface GitHubLicenseResponse {
  readonly key: string;
  readonly name: string;
  readonly spdx_id: string | null;
  readonly url: string | null;
}

export interface GitHubRepositoryResponse {
  readonly id: number;
  readonly node_id: string;
  readonly name: string;
  readonly full_name: string;
  readonly owner: GitHubOwnerResponse;
  readonly private: boolean;
  readonly html_url: string;
  readonly description: string | null;
  readonly fork: boolean;
  readonly created_at: string;
  readonly updated_at: string;
  readonly pushed_at: string | null;
  readonly homepage: string | null;
  readonly size: number;
  readonly stargazers_count: number;
  readonly watchers_count: number;
  readonly language: string | null;
  readonly forks_count: number;
  readonly open_issues_count: number;
  readonly license: GitHubLicenseResponse | null;
  readonly topics: readonly string[];
  readonly visibility: "public" | "private" | "internal";
  readonly default_branch: string;
  readonly archived: boolean;
  readonly disabled: boolean;
  readonly has_issues: boolean;
  readonly has_projects: boolean;
  readonly has_wiki: boolean;
  readonly has_pages: boolean;
  readonly has_discussions: boolean;
}

export interface GitHubCommunityFileResponse {
  readonly url: string;
  readonly html_url: string | null;
}

export interface GitHubCommunityFilesResponse {
  readonly code_of_conduct: GitHubCommunityFileResponse | null;
  readonly contributing: GitHubCommunityFileResponse | null;
  readonly issue_template: GitHubCommunityFileResponse | null;
  readonly license: GitHubCommunityFileResponse | null;
  readonly pull_request_template: GitHubCommunityFileResponse | null;
  readonly readme: GitHubCommunityFileResponse | null;
}

export interface GitHubCommunityProfileResponse {
  readonly health_percentage: number;
  readonly description: string | null;
  readonly documentation: string | null;
  readonly files: GitHubCommunityFilesResponse;
}

export type GitHubLanguagesResponse = Readonly<Record<string, number>>;

export interface GitHubLabelResponse {
  readonly id: number;
  readonly name: string | null;
  readonly color: string | null;
  readonly description: string | null;
}

export interface GitHubIssueResponse {
  readonly id: number;
  readonly number: number;
  readonly title: string;
  readonly html_url: string;
  readonly state: "open" | "closed";
  readonly created_at: string;
  readonly updated_at: string;
  readonly comments: number;
  readonly labels: readonly (string | GitHubLabelResponse)[];
  readonly pull_request?: Readonly<Record<string, unknown>>;
}

export interface GitHubReleaseResponse {
  readonly id: number;
  readonly tag_name: string;
  readonly name: string | null;
  readonly html_url: string;
  readonly draft: boolean;
  readonly prerelease: boolean;
  readonly created_at: string;
  readonly published_at: string | null;
  readonly body: string | null;
}

export interface GitHubCommitIdentityResponse {
  readonly name: string;
  readonly email: string;
  readonly date: string;
}

export interface GitHubCommitResponse {
  readonly sha: string;
  readonly html_url: string;
  readonly author: GitHubOwnerResponse | null;
  readonly commit: {
    readonly author: GitHubCommitIdentityResponse | null;
    readonly committer: GitHubCommitIdentityResponse | null;
    readonly message: string;
  };
}
