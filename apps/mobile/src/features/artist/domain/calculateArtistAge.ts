export function calculateArtistAge(startDate: string, endDate?: string | null): number {
    const today = new Date();
    const start = new Date(startDate);
    const end = endDate ? new Date(endDate) : today;

    let age = end.getFullYear() - start.getFullYear();
    const monthDiff = end.getMonth() - start.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && end.getDate() < start.getDate())) {
        age--;
    }

    return age;
}
