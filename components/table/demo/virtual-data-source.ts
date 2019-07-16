import { CollectionViewer } from '@angular/cdk/collections';
import { DataSource } from '@angular/cdk/table';
import { HttpClient } from '@angular/common/http';
import { Component, ViewChild } from '@angular/core';
import { NzTableComponent } from 'ng-zorro-antd';
import { BehaviorSubject, Observable, of, Subscription } from 'rxjs';
import { delay } from 'rxjs/operators';

@Component({
  selector: 'nz-demo-table-virtual-data-source',
  template: `
    <button nz-button (click)="scrollToIndex(1200)">Scroll to index 1200</button>
    <br />
    <br />
    <nz-table
      #virtualTable
      [nzData]="dataSource"
      [nzVirtualScroll]="true"
      [nzVirtualItemSize]="54"
      [nzFrontPagination]="false"
      [nzShowPagination]="false"
      [nzScroll]="{ x: '1300px', y: '240px' }"
    >
      <thead>
        <tr>
          <th nzWidth="100px" nzLeft="0px">Index</th>
          <th nzWidth="300px">Name</th>
          <th nzWidth="300px">Gender</th>
          <th nzWidth="600px">Email</th>
        </tr>
      </thead>
      <tbody>
        <ng-template nz-virtual-scroll let-data let-index="index">
          <tr>
            <td nzLeft="0px">{{ index }}</td>
            <td>{{ data.name.first }}</td>
            <td>{{ data.gender }}</td>
            <td>{{ data.email }}</td>
          </tr>
        </ng-template>
      </tbody>
    </nz-table>
  `
})
export class NzDemoTableVirtualDataSourceComponent {
  @ViewChild('virtualTable', { static: true })
  nzTableComponent!: NzTableComponent;

  readonly dataSource = new TableDataSource(this.httpClient);

  constructor(private readonly httpClient: HttpClient) {}

  scrollToIndex(index: number): void {
    this.nzTableComponent.cdkVirtualScrollViewport.scrollToIndex(index);
  }
}

class TableDataSource extends DataSource<User> {
  private readonly pageSize = 20;
  private readonly cachedData = Array.from<User>({ length: 100000 });
  private readonly fetchedPages = new Set<number>();
  private readonly dataStream = new BehaviorSubject<User[]>(this.cachedData);
  private readonly subscription = new Subscription();

  length$ = of(1);

  constructor(private readonly http: HttpClient) {
    super();
  }

  connect(collectionViewer: CollectionViewer): Observable<ReadonlyArray<User>> {
    this.subscription.add(
      collectionViewer.viewChange.subscribe(range => {
        const startPage = this.getPageForIndex(range.start);
        const endPage = this.getPageForIndex(range.end - 1);

        for (let i = startPage; i <= endPage; i++) {
          this.fetchPage(i);
        }
      })
    );

    return this.dataStream;
  }

  disconnect(): void {
    this.subscription.unsubscribe();
  }

  private getPageForIndex(index: number): number {
    return Math.floor(index / this.pageSize);
  }

  private fetchPage(page: number): void {
    if (this.fetchedPages.has(page)) {
      return;
    }

    this.fetchedPages.add(page);
    this.http
      .get(`https://randomuser.me/api/?results=${this.pageSize}&inc=name,gender,email,nat&noinfo`)
      .pipe(delay(200))
      .subscribe(result => {
        this.cachedData.splice(page * this.pageSize, this.pageSize, ...(result as Result).results);
        this.dataStream.next(this.cachedData);
      });
  }
}

interface Result {
  readonly results: ReadonlyArray<User>;
}

interface User {
  readonly name: { readonly first: string };
  readonly gender: string;
  readonly email: string;
}
