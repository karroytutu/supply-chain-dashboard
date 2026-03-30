/**
 * 采购绩效月度存档模块
 */

export {
  getLastMonthEndDate,
  getMonthFirstDay,
  calculateMonthlyAvailability,
  calculateMonthlyTurnover,
  saveMonthlyArchive,
  getMonthlyArchiveList,
} from './procurement-archive.service';

export type {
  MonthlyArchiveRecord,
  ArchiveInput,
  ArchiveQueryParams,
  MonthlyArchiveResponse,
  MonthlyAvailabilityResult,
  MonthlyTurnoverResult,
} from './procurement-archive.types';
