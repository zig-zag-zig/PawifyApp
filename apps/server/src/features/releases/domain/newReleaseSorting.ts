import type { NewRelease } from '../../../modules/models/models.js';

const unknownReleaseTime = Number.MIN_SAFE_INTEGER;

const dateToTimestamp = (date: string | null): number => {
    if (!date) {
        return unknownReleaseTime;
    }

    const dateParts = date.split('-');
    const year = Number.parseInt(dateParts[0] ?? '', 10);
    const month = Number.parseInt(dateParts[1] ?? '1', 10);
    const day = Number.parseInt(dateParts[2] ?? '1', 10);

    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
        return unknownReleaseTime;
    }

    return new Date(year, month - 1, day).getTime();
};

const getReleaseSortTime = (release: NewRelease): number => {
    return dateToTimestamp(release.date);
};

export const sortNewReleasesNewestFirst = (releases: NewRelease[]): NewRelease[] => {
    return [...releases].sort(
        (left, right) => getReleaseSortTime(right) - getReleaseSortTime(left),
    );
};
