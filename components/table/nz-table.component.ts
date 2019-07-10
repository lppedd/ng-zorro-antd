/**
 * @license
 * Copyright Alibaba.com All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://github.com/NG-ZORRO/ng-zorro-antd/blob/master/LICENSE
 */

import { isDataSource, CollectionViewer, DataSource, ListRange } from '@angular/cdk/collections';
import { Platform } from '@angular/cdk/platform';
import { CdkVirtualScrollViewport } from '@angular/cdk/scrolling';
import {
  AfterContentInit,
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ContentChild,
  ContentChildren,
  ElementRef,
  EventEmitter,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  QueryList,
  Renderer2,
  SimpleChanges,
  TemplateRef,
  TrackByFunction,
  ViewChild,
  ViewEncapsulation
} from '@angular/core';

import { measureScrollbar, InputBoolean, InputNumber, NzSizeMDSType } from 'ng-zorro-antd/core';
import { NzI18nService } from 'ng-zorro-antd/i18n';
import { fromEvent, merge, of, BehaviorSubject, EMPTY, Observable, Subject, Subscription } from 'rxjs';
import { flatMap, map, shareReplay, startWith, takeUntil, tap } from 'rxjs/operators';

import { NzThComponent } from './nz-th.component';
import { NzTheadComponent } from './nz-thead.component';
import { NzVirtualScrollDirective } from './nz-virtual-scroll.directive';

@Component({
  selector: 'nz-table',
  exportAs: 'nzTable',
  preserveWhitespaces: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  templateUrl: './nz-table.component.html',
  host: {
    '[class.ant-table-empty]': 'data.length === 0'
  },
  styles: [
    `
      nz-table {
        display: block;
      }

      cdk-virtual-scroll-viewport.ant-table-body {
        overflow-y: scroll;
      }
    `
  ]
})
// tslint:disable-next-line no-any
export class NzTableComponent<T = any>
  implements OnInit, AfterViewInit, OnDestroy, OnChanges, AfterContentInit, CollectionViewer {
  /**
   * This Subject will be used to interact with the {@link data} DataSource
   * in case front-end pagination is enabled.
   */
  viewChange = new Subject<ListRange>();

  /**
   * Table data can be inputted as a simple array, or a DataSource.
   * In case it is inputted as array, we'll wrap it in a custom
   * {@link NzDataSource}, which will give as the ability to display
   * all data, and to paginate correctly if front-end pagination is enabled.
   */
  data: NzDataSource<T> = NzEmptyDataSource.INSTANCE;

  locale: any = {}; // tslint:disable-line:no-any
  nzTheadComponent: NzTheadComponent;
  lastScrollLeft = 0;
  headerBottomStyle = {};
  private destroy$ = new Subject<void>();
  @ContentChildren(NzThComponent, { descendants: true }) listOfNzThComponent: QueryList<NzThComponent>;
  @ViewChild('tableHeaderElement', { static: false, read: ElementRef }) tableHeaderElement: ElementRef;
  @ViewChild('tableBodyElement', { static: false, read: ElementRef }) tableBodyElement: ElementRef;
  @ViewChild('tableMainElement', { static: false, read: ElementRef }) tableMainElement: ElementRef;
  @ViewChild(CdkVirtualScrollViewport, { static: false, read: ElementRef }) cdkVirtualScrollElement: ElementRef;
  @ViewChild(CdkVirtualScrollViewport, { static: false, read: CdkVirtualScrollViewport })
  cdkVirtualScrollViewport: CdkVirtualScrollViewport;
  @ContentChild(NzVirtualScrollDirective, { static: false }) nzVirtualScrollDirective: NzVirtualScrollDirective;
  @Input() nzSize: NzSizeMDSType = 'default';
  @Input() nzShowTotal: TemplateRef<{ $implicit: number; range: [number, number] }>;
  @Input() nzPageSizeOptions = [10, 20, 30, 40, 50];
  @Input() @InputBoolean() nzVirtualScroll = false;
  @Input() @InputNumber() nzVirtualItemSize = 0;
  @Input() @InputNumber() nzVirtualMaxBufferPx = 200;
  @Input() @InputNumber() nzVirtualMinBufferPx = 100;
  @Input() nzVirtualForTrackBy: TrackByFunction<T> | undefined;
  @Input() nzLoadingDelay = 0;
  @Input() nzLoadingIndicator: TemplateRef<void>;
  @Input() nzTotal = 0;
  @Input() nzTitle: string | TemplateRef<void>;
  @Input() nzFooter: string | TemplateRef<void>;
  @Input() nzNoResult: string | TemplateRef<void>;
  @Input() nzWidthConfig: string[] = [];
  @Input() nzPageIndex = 1;
  @Input() nzPageSize = 10;
  @Input() nzData: T[] | NzDataSource<T> = [];
  @Input() nzPaginationPosition: 'top' | 'bottom' | 'both' = 'bottom';
  @Input() nzScroll: { x?: string | null; y?: string | null } = { x: null, y: null };
  @Input() @ViewChild('renderItemTemplate', { static: true }) nzItemRender: TemplateRef<{
    $implicit: 'page' | 'prev' | 'next';
    page: number;
  }>;
  @Input() @InputBoolean() nzFrontPagination = true;
  @Input() @InputBoolean() nzTemplateMode = false;
  @Input() @InputBoolean() nzBordered = false;
  @Input() @InputBoolean() nzShowPagination = true;
  @Input() @InputBoolean() nzLoading = false;
  @Input() @InputBoolean() nzShowSizeChanger = false;
  @Input() @InputBoolean() nzHideOnSinglePage = false;
  @Input() @InputBoolean() nzShowQuickJumper = false;
  @Input() @InputBoolean() nzSimple = false;
  @Output() readonly nzPageSizeChange: EventEmitter<number> = new EventEmitter();
  @Output() readonly nzPageIndexChange: EventEmitter<number> = new EventEmitter();
  /* tslint:disable-next-line:no-any */
  @Output() readonly nzCurrentPageDataChange: EventEmitter<any[]> = new EventEmitter();

  get tableBodyNativeElement(): HTMLElement {
    return this.tableBodyElement && this.tableBodyElement.nativeElement;
  }

  get tableHeaderNativeElement(): HTMLElement {
    return this.tableHeaderElement && this.tableHeaderElement.nativeElement;
  }

  get cdkVirtualScrollNativeElement(): HTMLElement {
    return this.cdkVirtualScrollElement && this.cdkVirtualScrollElement.nativeElement;
  }

  get mixTableBodyNativeElement(): HTMLElement {
    return this.tableBodyNativeElement || this.cdkVirtualScrollNativeElement;
  }

  emitPageSizeOrIndex(size: number, index: number): void {
    if (this.nzPageSize !== size || this.nzPageIndex !== index) {
      if (this.nzPageSize !== size) {
        this.nzPageSize = size;
        this.nzPageSizeChange.emit(this.nzPageSize);
      }
      if (this.nzPageIndex !== index) {
        this.nzPageIndex = index;
        this.nzPageIndexChange.emit(this.nzPageIndex);
      }
      this.updateFrontPaginationDataIfNeeded(this.nzPageSize !== size);
    }
  }

  syncScrollTable(e: MouseEvent): void {
    if (e.currentTarget === e.target) {
      const target = e.target as HTMLElement;
      if (target.scrollLeft !== this.lastScrollLeft && this.nzScroll && this.nzScroll.x) {
        if (target === this.mixTableBodyNativeElement && this.tableHeaderNativeElement) {
          this.tableHeaderNativeElement.scrollLeft = target.scrollLeft;
        } else if (target === this.tableHeaderNativeElement && this.mixTableBodyNativeElement) {
          this.mixTableBodyNativeElement.scrollLeft = target.scrollLeft;
        }
        this.setScrollPositionClassName();
      }
      this.lastScrollLeft = target.scrollLeft;
    }
  }

  setScrollPositionClassName(): void {
    if (this.mixTableBodyNativeElement && this.nzScroll && this.nzScroll.x) {
      if (
        this.mixTableBodyNativeElement.scrollWidth === this.mixTableBodyNativeElement.clientWidth &&
        this.mixTableBodyNativeElement.scrollWidth !== 0
      ) {
        this.setScrollName();
      } else if (this.mixTableBodyNativeElement.scrollLeft === 0) {
        this.setScrollName('left');
      } else if (
        this.mixTableBodyNativeElement.scrollWidth ===
        this.mixTableBodyNativeElement.scrollLeft + this.mixTableBodyNativeElement.clientWidth
      ) {
        this.setScrollName('right');
      } else {
        this.setScrollName('middle');
      }
    }
  }

  setScrollName(position?: string): void {
    const prefix = 'ant-table-scroll-position';
    const classList = ['left', 'right', 'middle'];
    classList.forEach(name => {
      this.renderer.removeClass(this.tableMainElement.nativeElement, `${prefix}-${name}`);
    });
    if (position) {
      this.renderer.addClass(this.tableMainElement.nativeElement, `${prefix}-${position}`);
    }
  }

  fitScrollBar(): void {
    if (this.nzScroll.y) {
      const scrollbarWidth = measureScrollbar('vertical');
      const scrollbarWidthOfHeader = measureScrollbar('horizontal', 'ant-table');
      // Add negative margin bottom for scroll bar overflow bug
      if (scrollbarWidthOfHeader > 0) {
        this.headerBottomStyle = {
          marginBottom: `-${scrollbarWidthOfHeader}px`,
          paddingBottom: '0px',
          overflowX: 'scroll',
          overflowY: `${scrollbarWidth === 0 ? 'hidden' : 'scroll'}`
        };
        this.cdr.markForCheck();
      }
    }
  }

  updateFrontPaginationDataIfNeeded(isPageSizeOrDataChange: boolean = false): void {
    if (this.nzFrontPagination) {
      const total = this.data.length;
      this.nzTotal = total;

      if (isPageSizeOrDataChange) {
        const maxPageIndex = Math.ceil(total / this.nzPageSize) || 1;
        const pageIndex = this.nzPageIndex > maxPageIndex ? maxPageIndex : this.nzPageIndex;
        if (pageIndex !== this.nzPageIndex) {
          this.nzPageIndex = pageIndex;
          Promise.resolve().then(() => this.nzPageIndexChange.emit(pageIndex));
        }
      }

      // Notify the DataSource we need to display a specific range of records
      this.viewChange.next({
        start: (this.nzPageIndex - 1) * this.nzPageSize,
        end: this.nzPageIndex * this.nzPageSize
      });
    }
  }

  constructor(
    private renderer: Renderer2,
    private ngZone: NgZone,
    private cdr: ChangeDetectorRef,
    private i18n: NzI18nService,
    private platform: Platform,
    elementRef: ElementRef
  ) {
    renderer.addClass(elementRef.nativeElement, 'ant-table-wrapper');
  }

  ngOnInit(): void {
    this.i18n.localeChange.pipe(takeUntil(this.destroy$)).subscribe(() => {
      this.locale = this.i18n.getLocaleData('Table');
      this.cdr.markForCheck();
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes.nzData) {
      this.handleDataChange(this.nzData);
    }

    if (changes.nzScroll) {
      if (changes.nzScroll.currentValue) {
        this.nzScroll = changes.nzScroll.currentValue;
      } else {
        this.nzScroll = { x: null, y: null };
      }
      this.setScrollPositionClassName();
    }

    if (changes.nzPageIndex || changes.nzPageSize || changes.nzFrontPagination || changes.nzData) {
      this.updateFrontPaginationDataIfNeeded(!!(changes.nzPageSize || changes.nzData));
    }
  }

  ngAfterViewInit(): void {
    if (!this.platform.isBrowser) {
      return;
    }
    setTimeout(() => this.setScrollPositionClassName());
    this.ngZone.runOutsideAngular(() => {
      merge<MouseEvent>(
        this.tableHeaderNativeElement ? fromEvent<MouseEvent>(this.tableHeaderNativeElement, 'scroll') : EMPTY,
        this.mixTableBodyNativeElement ? fromEvent<MouseEvent>(this.mixTableBodyNativeElement, 'scroll') : EMPTY
      )
        .pipe(takeUntil(this.destroy$))
        .subscribe((data: MouseEvent) => {
          this.syncScrollTable(data);
        });
      fromEvent<UIEvent>(window, 'resize')
        .pipe(
          startWith(true),
          takeUntil(this.destroy$)
        )
        .subscribe(() => {
          this.fitScrollBar();
          this.setScrollPositionClassName();
        });
    });
  }

  ngAfterContentInit(): void {
    this.listOfNzThComponent.changes
      .pipe(
        startWith(true),
        flatMap(() =>
          merge(this.listOfNzThComponent.changes, ...this.listOfNzThComponent.map(th => th.nzWidthChange$))
        ),
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        this.cdr.markForCheck();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private handleDataChange(nzData: NzDataSource<T> | T[]): void {
    const frontPagination = this.nzShowPagination && this.nzFrontPagination;
    const displayAll = this.nzVirtualScroll && !frontPagination;
    this.data = isDataSource(nzData) ? nzData : new NzArrayDataSource(nzData, displayAll);

    if (frontPagination) {
      this.data = new NzDetachedDataSource(this, this.data);
      this.data.connect(this).subscribe({
        next: data => this.nzCurrentPageDataChange.emit(data as T[])
      });
    }
  }
}

export abstract class NzDataSource<T> extends DataSource<T> implements Iterable<T> {
  /**
   * The length of the data represented by this DataSource.
   */
  abstract get length(): number;

  [Symbol.iterator](): Iterator<T> {
    throw new Error('Iterator must be implemented');
  }
}

/**
 * This DataSource manages a simple array.
 * It also offers pagination capabilities via a {@link CollectionViewer}.
 */
class NzArrayDataSource<T> extends NzDataSource<T> {
  /**
   * Holds the temporary state of the data array when pagination is enabled.
   */
  private paginatedData: ReadonlyArray<T> = [...this.data];

  /**
   * @param data The original data array coming from the user
   * @param displayAll If `true`, emits the entire array at once without reacting to range/view events
   */
  constructor(private readonly data: ReadonlyArray<T>, private readonly displayAll: boolean = false) {
    super();
  }

  get length(): number {
    return this.data.length;
  }

  connect(collectionViewer: CollectionViewer): Observable<ReadonlyArray<T>> {
    if (this.displayAll) {
      return of(this.data);
    }

    return collectionViewer.viewChange.pipe(
      map(({ start, end }) => this.data.slice(start, end)),
      tap(data => (this.paginatedData = data))
    );
  }

  disconnect(): void {}

  [Symbol.iterator](): Iterator<T> {
    return this.paginatedData.values();
  }
}

/**
 * This DataSource answer data requests coming only from the table Component.
 * Any other connected {@link CollectionViewer} is ignored.
 */
class NzDetachedDataSource<T> extends NzDataSource<T> {
  private readonly source$ = new BehaviorSubject<ReadonlyArray<T>>([]);
  private readonly data$ = this.source$.asObservable().pipe(shareReplay(1));
  private readonly subscription = new Subscription();

  constructor(table: NzTableComponent, readonly dataSource: NzDataSource<T>) {
    super();
    this.subscription.add(
      this.dataSource.connect(table).subscribe({
        next: data => this.source$.next(data)
      })
    );
  }

  get length(): number {
    return this.dataSource.length;
  }

  connect(): Observable<ReadonlyArray<T>> {
    return this.data$;
  }

  disconnect(): void {
    this.subscription.unsubscribe();
  }

  [Symbol.iterator](): Iterator<T> {
    return this.dataSource[Symbol.iterator]();
  }
}

class NzEmptyDataSource<T> extends NzDataSource<T> {
  // tslint:disable-next-line:no-any
  static readonly INSTANCE = new NzEmptyDataSource<any>();

  private readonly emptyData$: Observable<ReadonlyArray<T>> = of([]).pipe(shareReplay(1));
  private readonly emptyIterator: Iterator<T> = {
    next(): IteratorResult<T> {
      return { done: true, value: undefined! };
    }
  };

  get length(): number {
    return 0;
  }

  connect(): Observable<ReadonlyArray<T>> {
    return this.emptyData$;
  }

  disconnect(): void {}

  [Symbol.iterator](): Iterator<T> {
    return this.emptyIterator;
  }
}
