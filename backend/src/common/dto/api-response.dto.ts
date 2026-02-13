export class ApiResponseDto<T> {
  data: T;
  error: null | { message: string; code: string };
}

export class ApiErrorDto {
  message: string;
  code: string;
}

export class PaginatedResponseDto<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}
