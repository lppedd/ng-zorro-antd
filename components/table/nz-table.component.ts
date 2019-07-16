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
import { first, flatMap, shareReplay, startWith, takeUntil } from 'rxjs/operators';

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
    '[class.ant-table-empty]': 'nzTotal === 0'
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
export class NzTableComponent<T = any> implements OnInit, AfterViewInit, OnDestroy, OnChanges, AfterContentInit {
  data: readonly T[] = [];
  dataSource: NzDataSource<T> = new NzEmptyDataSource<T>();
  tableManager: NzTableManager<T> = new NzEmptyTableManager<T>();

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
    if (!this.nzFrontPagination) {
      this.tableManager.displayAll();
    }

    const update = (total: number) => {
      this.nzTotal = total;

      if (this.nzFrontPagination) {
        if (isPageSizeOrDataChange) {
          const maxPageIndex = Math.ceil(this.nzTotal / this.nzPageSize) || 1;
          const pageIndex = this.nzPageIndex > maxPageIndex ? maxPageIndex : this.nzPageIndex;
          if (pageIndex !== this.nzPageIndex) {
            this.nzPageIndex = pageIndex;
            Promise.resolve().then(() => this.nzPageIndexChange.emit(pageIndex));
          }
        }

        this.tableManager.paginate({
          start: (this.nzPageIndex - 1) * this.nzPageSize,
          end: this.nzPageIndex * this.nzPageSize
        });
      }
    };

    this.tableManager.length$.pipe(first()).subscribe({ next: update });
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

  private handleDataChange(nzData: T[] | NzDataSource<T>): void {
    if (isDataSource(nzData)) {
      this.tableManager = new NzDataSourceTableManager<T>(this, nzData);
    } else {
      this.tableManager = new NzArrayTableManager<T>(this, nzData);
    }
  }
}

export abstract class NzDataSource<T> extends DataSource<T> {
  abstract length$: Observable<number>;
}

interface NzTableManager<T> {
  data: readonly T[] | DataSource<T>;
  length$: Observable<number>;

  displayAll(): void;
  paginate(range: ListRange): void;
}

class NzArrayTableManager<T> implements NzTableManager<T> {
  data: readonly T[];
  readonly length$ = of(this.userData.length).pipe(shareReplay(1));

  constructor(
    private readonly table: NzTableComponent<T>, //
    private readonly userData: readonly T[]
  ) {
    this.data = this.userData;
    this.table.data = this.userData;
  }

  displayAll(): void {
    this.data = this.userData;
    this.table.data = this.userData;
  }

  paginate(range: ListRange): void {
    this.data = this.userData.slice(range.start, range.end);
    this.table.data = this.data;
    this.table.nzCurrentPageDataChange.emit(this.data as T[]);
  }
}

class NzDataSourceTableManager<T> implements NzTableManager<T>, CollectionViewer {
  readonly data: NzDataSource<T>;
  readonly length$: Observable<number>;
  readonly viewChange = new Subject<ListRange>();

  constructor(
    private readonly table: NzTableComponent<T>, //
    dataSource: NzDataSource<T>
  ) {
    if (table.nzShowPagination && table.nzFrontPagination) {
      // tslint:disable-next-line:no-parameter-reassignment
      dataSource = new NzDetachedDataSource(this, dataSource);
      dataSource.connect(this).subscribe({
        next: data => table.nzCurrentPageDataChange.emit(data as T[])
      });
    }

    this.data = dataSource;
    this.table.dataSource = dataSource;
    this.length$ = dataSource.length$.pipe(shareReplay(1));
  }

  displayAll(): void {}

  paginate(range: ListRange): void {
    this.viewChange.next(range);
  }
}

class NzEmptyTableManager<T> implements NzTableManager<T> {
  data = [];
  length$ = of(0);

  paginate(): void {}
  displayAll(): void {}
}

class NzDetachedDataSource<T> extends NzDataSource<T> {
  readonly length$ = this.dataSource.length$;

  private readonly source$ = new BehaviorSubject<readonly T[]>([]);
  private readonly data$ = this.source$.asObservable().pipe(shareReplay(1));
  private readonly subscription = new Subscription();

  constructor(tableManager: NzDataSourceTableManager<T>, readonly dataSource: NzDataSource<T>) {
    super();
    this.subscription.add(
      this.dataSource.connect(tableManager).subscribe({
        next: data => this.source$.next(data)
      })
    );
  }

  connect(): Observable<readonly T[]> {
    return this.data$;
  }

  disconnect(): void {
    this.subscription.unsubscribe();
  }
}

class NzEmptyDataSource<T> extends NzDataSource<T> {
  readonly length$ = of(0).pipe(shareReplay(1));

  connect(): Observable<readonly T[]> {
    return of([]).pipe(shareReplay(1));
  }

  disconnect(): void {}
}
