import { ArrowLeftSmallIcon, ArrowRightSmallIcon } from '@blocksuite/icons/rc';
import clsx from 'clsx';
import { useCallback, useMemo } from 'react';
import ReactPaginate from 'react-paginate';

import { mirrorInRtl } from '../../styles';
import * as styles from './pagination.css';
export interface PaginationProps {
  totalCount: number;
  pageNum?: number;
  countPerPage: number;
  onPageChange: (skip: number, pageNum: number) => void;
}

export const Pagination = ({
  totalCount,
  countPerPage,
  pageNum,
  onPageChange,
}: PaginationProps) => {
  const handlePageClick = useCallback(
    (e: { selected: number }) => {
      const newOffset = (e.selected * countPerPage) % totalCount;
      onPageChange(newOffset, e.selected);
    },
    [countPerPage, onPageChange, totalCount]
  );

  const pageCount = useMemo(
    () => Math.ceil(totalCount / countPerPage),
    [countPerPage, totalCount]
  );

  return (
    <ReactPaginate
      onPageChange={handlePageClick}
      pageRangeDisplayed={3}
      marginPagesDisplayed={2}
      pageCount={pageCount}
      forcePage={pageNum}
      previousLabel={<ArrowLeftSmallIcon className={mirrorInRtl} />}
      nextLabel={<ArrowRightSmallIcon className={mirrorInRtl} />}
      pageClassName={styles.pageItem}
      previousClassName={clsx(styles.pageItem, 'label')}
      nextClassName={clsx(styles.pageItem, 'label')}
      breakLabel="..."
      breakClassName={styles.pageItem}
      containerClassName={styles.pagination}
      activeClassName="active"
      renderOnZeroPageCount={null}
    />
  );
};
