-- CreateIndex
CREATE INDEX "Album_userId_idx" ON "Album"("userId");

-- CreateIndex
CREATE INDEX "Album_createdAt_idx" ON "Album"("createdAt");

-- CreateIndex
CREATE INDEX "AuthorizationCode_clientId_idx" ON "AuthorizationCode"("clientId");

-- CreateIndex
CREATE INDEX "AuthorizationCode_userId_idx" ON "AuthorizationCode"("userId");

-- CreateIndex
CREATE INDEX "AuthorizationCode_expiresAt_idx" ON "AuthorizationCode"("expiresAt");

-- CreateIndex
CREATE INDEX "AuthorizationCode_used_idx" ON "AuthorizationCode"("used");

-- CreateIndex
CREATE INDEX "AuthorizationCode_clientId_userId_idx" ON "AuthorizationCode"("clientId", "userId");

-- CreateIndex
CREATE INDEX "AuthorizationCode_clientId_userId_expiresAt_idx" ON "AuthorizationCode"("clientId", "userId", "expiresAt");

-- CreateIndex
CREATE INDEX "AuthorizationCode_clientId_userId_expiresAt_used_idx" ON "AuthorizationCode"("clientId", "userId", "expiresAt", "used");

-- CreateIndex
CREATE INDEX "Comment_userId_idx" ON "Comment"("userId");

-- CreateIndex
CREATE INDEX "Comment_photoId_idx" ON "Comment"("photoId");

-- CreateIndex
CREATE INDEX "EmailPasswordReset_email_idx" ON "EmailPasswordReset"("email");

-- CreateIndex
CREATE INDEX "EmailPasswordReset_token_idx" ON "EmailPasswordReset"("token");

-- CreateIndex
CREATE INDEX "EmailPasswordReset_expiresAt_idx" ON "EmailPasswordReset"("expiresAt");

-- CreateIndex
CREATE INDEX "EmailPasswordReset_used_idx" ON "EmailPasswordReset"("used");

-- CreateIndex
CREATE INDEX "EmailPasswordReset_email_expiresAt_idx" ON "EmailPasswordReset"("email", "expiresAt");

-- CreateIndex
CREATE INDEX "EmailPasswordReset_email_expiresAt_used_idx" ON "EmailPasswordReset"("email", "expiresAt", "used");

-- CreateIndex
CREATE INDEX "EmailPasswordReset_email_token_expiresAt_idx" ON "EmailPasswordReset"("email", "token", "expiresAt");

-- CreateIndex
CREATE INDEX "EmailPasswordReset_email_token_expiresAt_used_idx" ON "EmailPasswordReset"("email", "token", "expiresAt", "used");

-- CreateIndex
CREATE INDEX "EmailVerification_email_idx" ON "EmailVerification"("email");

-- CreateIndex
CREATE INDEX "EmailVerification_token_idx" ON "EmailVerification"("token");

-- CreateIndex
CREATE INDEX "EmailVerification_expiresAt_idx" ON "EmailVerification"("expiresAt");

-- CreateIndex
CREATE INDEX "EmailVerification_used_idx" ON "EmailVerification"("used");

-- CreateIndex
CREATE INDEX "EmailVerification_email_expiresAt_idx" ON "EmailVerification"("email", "expiresAt");

-- CreateIndex
CREATE INDEX "EmailVerification_email_expiresAt_used_idx" ON "EmailVerification"("email", "expiresAt", "used");

-- CreateIndex
CREATE INDEX "EmailVerification_email_token_expiresAt_idx" ON "EmailVerification"("email", "token", "expiresAt");

-- CreateIndex
CREATE INDEX "EmailVerification_email_token_expiresAt_used_idx" ON "EmailVerification"("email", "token", "expiresAt", "used");

-- CreateIndex
CREATE INDEX "Like_userId_idx" ON "Like"("userId");

-- CreateIndex
CREATE INDEX "Like_photoId_idx" ON "Like"("photoId");

-- CreateIndex
CREATE INDEX "Message_senderId_idx" ON "Message"("senderId");

-- CreateIndex
CREATE INDEX "Message_receiverId_idx" ON "Message"("receiverId");

-- CreateIndex
CREATE INDEX "Message_timestamp_idx" ON "Message"("timestamp");

-- CreateIndex
CREATE INDEX "Message_senderId_receiverId_idx" ON "Message"("senderId", "receiverId");

-- CreateIndex
CREATE INDEX "Message_senderId_receiverId_timestamp_idx" ON "Message"("senderId", "receiverId", "timestamp");

-- CreateIndex
CREATE INDEX "MessageDeletion_messageId_idx" ON "MessageDeletion"("messageId");

-- CreateIndex
CREATE INDEX "MessageDeletion_userId_idx" ON "MessageDeletion"("userId");

-- CreateIndex
CREATE INDEX "MessageDeletion_messageId_userId_idx" ON "MessageDeletion"("messageId", "userId");

-- CreateIndex
CREATE INDEX "MessageRead_messageId_idx" ON "MessageRead"("messageId");

-- CreateIndex
CREATE INDEX "MessageRead_userId_idx" ON "MessageRead"("userId");

-- CreateIndex
CREATE INDEX "MessageRead_readAt_idx" ON "MessageRead"("readAt");

-- CreateIndex
CREATE INDEX "MessageRead_messageId_userId_idx" ON "MessageRead"("messageId", "userId");

-- CreateIndex
CREATE INDEX "MessageRead_messageId_userId_readAt_idx" ON "MessageRead"("messageId", "userId", "readAt");

-- CreateIndex
CREATE INDEX "OAuthClient_userId_idx" ON "OAuthClient"("userId");

-- CreateIndex
CREATE INDEX "OAuthClient_clientId_idx" ON "OAuthClient"("clientId");

-- CreateIndex
CREATE INDEX "OAuthClient_createdAt_idx" ON "OAuthClient"("createdAt");

-- CreateIndex
CREATE INDEX "OAuthClient_userId_clientId_idx" ON "OAuthClient"("userId", "clientId");

-- CreateIndex
CREATE INDEX "OAuthToken_clientId_idx" ON "OAuthToken"("clientId");

-- CreateIndex
CREATE INDEX "OAuthToken_userId_idx" ON "OAuthToken"("userId");

-- CreateIndex
CREATE INDEX "OAuthToken_expiresAt_idx" ON "OAuthToken"("expiresAt");

-- CreateIndex
CREATE INDEX "OAuthToken_revokedAt_idx" ON "OAuthToken"("revokedAt");

-- CreateIndex
CREATE INDEX "OAuthToken_clientId_userId_idx" ON "OAuthToken"("clientId", "userId");

-- CreateIndex
CREATE INDEX "OAuthToken_clientId_userId_expiresAt_idx" ON "OAuthToken"("clientId", "userId", "expiresAt");

-- CreateIndex
CREATE INDEX "OAuthToken_clientId_userId_expiresAt_revokedAt_idx" ON "OAuthToken"("clientId", "userId", "expiresAt", "revokedAt");

-- CreateIndex
CREATE INDEX "Photo_userId_idx" ON "Photo"("userId");

-- CreateIndex
CREATE INDEX "Photo_createdAt_idx" ON "Photo"("createdAt");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "RefreshToken_token_idx" ON "RefreshToken"("token");

-- CreateIndex
CREATE INDEX "RefreshToken_expires_idx" ON "RefreshToken"("expires");

-- CreateIndex
CREATE INDEX "RefreshToken_revoked_idx" ON "RefreshToken"("revoked");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_expires_idx" ON "RefreshToken"("userId", "expires");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_revoked_idx" ON "RefreshToken"("userId", "revoked");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_expires_revoked_idx" ON "RefreshToken"("userId", "expires", "revoked");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_expires_revoked_tokenVersion_idx" ON "RefreshToken"("userId", "expires", "revoked", "tokenVersion");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_username_idx" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_username_email_idx" ON "User"("username", "email");

-- CreateIndex
CREATE INDEX "User_username_email_role_idx" ON "User"("username", "email", "role");

-- CreateIndex
CREATE INDEX "UserConsent_userId_idx" ON "UserConsent"("userId");

-- CreateIndex
CREATE INDEX "UserConsent_clientId_idx" ON "UserConsent"("clientId");

-- CreateIndex
CREATE INDEX "UserConsent_revokedAt_idx" ON "UserConsent"("revokedAt");

-- CreateIndex
CREATE INDEX "UserConsent_userId_clientId_idx" ON "UserConsent"("userId", "clientId");

-- CreateIndex
CREATE INDEX "UserConsent_userId_clientId_revokedAt_idx" ON "UserConsent"("userId", "clientId", "revokedAt");

-- CreateIndex
CREATE INDEX "UserEvents_userId_idx" ON "UserEvents"("userId");

-- CreateIndex
CREATE INDEX "UserEvents_eventType_idx" ON "UserEvents"("eventType");

-- CreateIndex
CREATE INDEX "UserEvents_createdAt_idx" ON "UserEvents"("createdAt");

-- CreateIndex
CREATE INDEX "UserLogin_userId_idx" ON "UserLogin"("userId");

-- CreateIndex
CREATE INDEX "UserLogin_createdAt_idx" ON "UserLogin"("createdAt");

-- CreateIndex
CREATE INDEX "UserLogin_ip_idx" ON "UserLogin"("ip");

-- CreateIndex
CREATE INDEX "UserPrivaySettings_userId_idx" ON "UserPrivaySettings"("userId");

-- CreateIndex
CREATE INDEX "Video_userId_idx" ON "Video"("userId");

-- CreateIndex
CREATE INDEX "Video_createdAt_idx" ON "Video"("createdAt");
