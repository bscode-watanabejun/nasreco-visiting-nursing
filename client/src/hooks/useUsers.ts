import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userApi, CreateUserRequest, UpdateUserRequest, ApiError } from '@/lib/api';
import type { User } from '@shared/schema';
import { useToast } from '@/hooks/use-toast';

// Query keys for caching
export const userQueryKeys = {
  all: ['users'] as const,
  lists: () => [...userQueryKeys.all, 'list'] as const,
  list: (page: number, limit: number) => [...userQueryKeys.lists(), { page, limit }] as const,
};

// Hook for fetching users list
export function useUsersQuery(page = 1, limit = 20) {
  return useQuery({
    queryKey: userQueryKeys.list(page, limit),
    queryFn: () => userApi.getUsers(page, limit),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// Hook for creating a new user
export function useCreateUserMutation() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (userData: CreateUserRequest) => userApi.createUser(userData),
    onSuccess: (newUser) => {
      // Invalidate and refetch users list
      queryClient.invalidateQueries({ queryKey: userQueryKeys.lists() });

      toast({
        title: '新規ユーザー作成完了',
        description: `${newUser.fullName}さんのアカウントが作成されました`,
      });
    },
    onError: (error: ApiError) => {
      toast({
        title: '新規ユーザー作成エラー',
        description: error.message || '予期しないエラーが発生しました',
        variant: 'destructive',
      });
    },
  });
}

// Hook for updating a user
export function useUpdateUserMutation() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ id, userData }: { id: string; userData: UpdateUserRequest }) =>
      userApi.updateUser(id, userData),
    onSuccess: (updatedUser) => {
      // Invalidate and refetch users list
      queryClient.invalidateQueries({ queryKey: userQueryKeys.lists() });

      // Invalidate current user cache if updating self
      // This ensures specialist certifications and other profile changes are immediately reflected
      queryClient.invalidateQueries({ queryKey: ['currentUser'] });

      toast({
        title: 'ユーザー情報更新完了',
        description: `${updatedUser.fullName}さんの情報が更新されました`,
      });
    },
    onError: (error: ApiError) => {
      toast({
        title: 'ユーザー情報更新エラー',
        description: error.message || '予期しないエラーが発生しました',
        variant: 'destructive',
      });
    },
  });
}

// Hook for deleting a user (if needed in the future)
export function useDeleteUserMutation() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (userId: string) => userApi.deleteUser(userId),
    onSuccess: () => {
      // Invalidate and refetch users list
      queryClient.invalidateQueries({ queryKey: userQueryKeys.lists() });

      toast({
        title: 'ユーザー削除完了',
        description: 'ユーザーが削除されました',
      });
    },
    onError: (error: ApiError) => {
      toast({
        title: 'ユーザー削除エラー',
        description: error.message || '予期しないエラーが発生しました',
        variant: 'destructive',
      });
    },
  });
}

// Hook for deactivating a user
export function useDeactivateUserMutation() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (userId: string) => userApi.deactivateUser(userId),
    onSuccess: (deactivatedUser) => {
      // Invalidate and refetch users list
      queryClient.invalidateQueries({ queryKey: userQueryKeys.lists() });

      toast({
        title: 'ユーザー無効化完了',
        description: `${deactivatedUser.fullName}さんのアカウントを無効化しました`,
      });
    },
    onError: (error: ApiError) => {
      toast({
        title: 'ユーザー無効化エラー',
        description: error.message || '予期しないエラーが発生しました',
        variant: 'destructive',
      });
    },
  });
}

// Hook for activating a user
export function useActivateUserMutation() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (userId: string) => userApi.activateUser(userId),
    onSuccess: (activatedUser) => {
      // Invalidate and refetch users list
      queryClient.invalidateQueries({ queryKey: userQueryKeys.lists() });

      toast({
        title: 'ユーザー有効化完了',
        description: `${activatedUser.fullName}さんのアカウントを有効化しました`,
      });
    },
    onError: (error: ApiError) => {
      toast({
        title: 'ユーザー有効化エラー',
        description: error.message || '予期しないエラーが発生しました',
        variant: 'destructive',
      });
    },
  });
}

// Hook for resetting user password
export function useResetPasswordMutation() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (userId: string) => userApi.resetPassword(userId),
    onSuccess: () => {
      // Invalidate and refetch users list
      queryClient.invalidateQueries({ queryKey: userQueryKeys.lists() });

      // Success toast is handled in the component to show the temporary password
    },
    onError: (error: ApiError) => {
      toast({
        title: 'パスワードリセットエラー',
        description: error.message || '予期しないエラーが発生しました',
        variant: 'destructive',
      });
    },
  });
}