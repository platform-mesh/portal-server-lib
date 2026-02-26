const processValue = (
  currentValue: unknown,
  valueToReplace: string,
  newValue: string,
  setValue: (value: string) => void,
): void => {
  if (typeof currentValue === 'string' && currentValue === valueToReplace) {
    setValue(newValue);
    return;
  }

  if (currentValue && typeof currentValue === 'object') {
    replaceStringDeep(currentValue, valueToReplace, newValue);
  }
};

export const replaceStringDeep = (
  target: unknown,
  previousValue: string,
  nextValue: string,
): void => {
  if (target === null || typeof target !== 'object') {
    return;
  }

  if (Array.isArray(target)) {
    target.forEach((item, index) => {
      processValue(item, previousValue, nextValue, (updatedValue) => {
        target[index] = updatedValue;
      });
    });
    return;
  }

  Object.entries(target).forEach(([key, value]) => {
    processValue(value, previousValue, nextValue, (updatedValue) => {
      target[key] = updatedValue;
    });
  });
};
