// Runs before every test file: the suite's expectations are English names, a
// 12-hour clock and a Monday week start, whatever the machine's locale is.

import { setLocale } from "../lib/locale";

setLocale("en-US", 1);
