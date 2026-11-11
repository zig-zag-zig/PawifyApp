const dateTimeMin = -8640000000000000;

const dateToTimestamp = (dateStr: string | null): number => {
  if (!dateStr?.trim()) return dateTimeMin;

  const parsedDate = new Date(dateStr);
  if (!isNaN(parsedDate.getTime())) {
    return parsedDate.getTime();
  }

  const dateParts = dateStr.split('-');

  if (dateParts.length === 1) dateParts.push('01');

  if (dateParts.length === 2) dateParts.push('01');

  if (dateParts.length !== 3) return dateTimeMin;

  const day = dateParts[2].padStart(2, '0');
  const month = dateParts[1].padStart(2, '0');

  const validDate = new Date(`${dateParts[0]}-${month}-${day}`);

  if (isNaN(validDate.getTime())) {
    console.error("Invalid date:", dateStr);
    return dateTimeMin;
  }

  return validDate.getTime();
};

const MONTHS_SHORT_EN = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

export const formatDate = (dateStr: string | null): string => {
  const unixTimeStamp = dateToTimestamp(dateStr);
  if (unixTimeStamp === dateTimeMin) return "Unknown date";
  let result = '';
  const date = dateStr?.split('-') ?? [];
  if (date.length > 1) {
    if (date.length === 3) {
      result = date[2].padStart(2, "0") + ".";
    }
    result += date[1].padStart(2, "0") + ".";
  }
  if (date.length > 0) {
    result += date[0];
  }

  return result;
};

/**
 * Formats an ISO or European date into Meowsic's human-friendly tag format
 * (`dd-MMM-yyyy`, e.g. `28-Oct-2026`, `Oct-2026`, or `2026`).
 */
export const formatDisplayDate = (
  dateStr: string | null | undefined,
  fallbackDisplay?: string | null,
): string => {
  const raw = dateStr?.trim();
  if (raw) {
    const isoMatch = /^(\d{4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?$/.exec(raw);
    if (isoMatch) {
      const year = isoMatch[1]!;
      const monthNum = isoMatch[2] ? Number(isoMatch[2]) : 0;
      const month = monthNum >= 1 && monthNum <= 12 ? MONTHS_SHORT_EN[monthNum - 1] : undefined;
      const day = isoMatch[3] ? isoMatch[3].padStart(2, '0') : undefined;
      if (day && month) return `${day}-${month}-${year}`;
      if (month) return `${month}-${year}`;
      return year;
    }
  }

  const fb = fallbackDisplay?.trim();
  if (fb) {
    const dotMatch = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(fb);
    if (dotMatch) {
      const day = dotMatch[1]!.padStart(2, '0');
      const monthNum = Number(dotMatch[2]);
      const year = dotMatch[3]!;
      const month = monthNum >= 1 && monthNum <= 12 ? MONTHS_SHORT_EN[monthNum - 1] : undefined;
      if (month) return `${day}-${month}-${year}`;
    }
    const dotMonthYear = /^(\d{1,2})\.(\d{4})$/.exec(fb);
    if (dotMonthYear) {
      const monthNum = Number(dotMonthYear[1]);
      const year = dotMonthYear[2]!;
      const month = monthNum >= 1 && monthNum <= 12 ? MONTHS_SHORT_EN[monthNum - 1] : undefined;
      if (month) return `${month}-${year}`;
    }
    return fb;
  }

  return 'Unknown date';
};
