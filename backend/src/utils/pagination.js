export const getPagination = (query) => {
  const take = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
  const cursor = query.cursor ? { id: query.cursor } : undefined;
  return { take, cursor, skip: cursor ? 1 : 0 };
};

export const pageResult = (items, take) => ({
  results: items,
  nextCursor: items.length === take ? items[items.length - 1].id : null
});
