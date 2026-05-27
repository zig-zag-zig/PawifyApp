import type { NewReleaseListItem } from '../../../contexts/NewReleasesContext';

export const RELEASES_PAGE_SIZE = 10;

export function paginateReleases(
    releases: NewReleaseListItem[],
    page: number,
    pageSize: number = RELEASES_PAGE_SIZE
): NewReleaseListItem[] {
    return releases.slice(0, (page + 1) * pageSize);
}

export function canLoadMoreReleases(
    releases: NewReleaseListItem[],
    page: number,
    pageSize: number = RELEASES_PAGE_SIZE
): boolean {
    return (page + 1) * pageSize < releases.length;
}
