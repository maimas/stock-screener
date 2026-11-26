export class NumberUtils {
  static toFixed(value: number, precision: number = 2): number {
    return value ? Number.parseFloat(value.toFixed(precision)) : 0;
  }
}
