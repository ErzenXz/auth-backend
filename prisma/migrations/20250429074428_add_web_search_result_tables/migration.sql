-- CreateTable
CREATE TABLE "WebSearchResult" (
    "id" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "searchResults" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebSearchResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebSearchSource" (
    "id" TEXT NOT NULL,
    "searchResultId" TEXT NOT NULL,
    "title" TEXT,
    "url" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isImage" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebSearchSource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WebSearchResult_userId_idx" ON "WebSearchResult"("userId");

-- CreateIndex
CREATE INDEX "WebSearchResult_query_idx" ON "WebSearchResult"("query");

-- CreateIndex
CREATE INDEX "WebSearchResult_createdAt_idx" ON "WebSearchResult"("createdAt");

-- CreateIndex
CREATE INDEX "WebSearchSource_searchResultId_idx" ON "WebSearchSource"("searchResultId");

-- CreateIndex
CREATE INDEX "WebSearchSource_sourceType_idx" ON "WebSearchSource"("sourceType");

-- CreateIndex
CREATE INDEX "WebSearchSource_url_idx" ON "WebSearchSource"("url");

-- AddForeignKey
ALTER TABLE "WebSearchResult" ADD CONSTRAINT "WebSearchResult_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebSearchSource" ADD CONSTRAINT "WebSearchSource_searchResultId_fkey" FOREIGN KEY ("searchResultId") REFERENCES "WebSearchResult"("id") ON DELETE CASCADE ON UPDATE CASCADE;
