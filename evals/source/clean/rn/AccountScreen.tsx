import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, Pressable } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

const Stack = createNativeStackNavigator();

function AccountScreen() {
  const [name, setName] = useState('');
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
        <Text accessibilityRole="header" style={{ fontSize: 24, fontWeight: '700' }}>Account</Text>
        <TextInput value={name} onChangeText={setName} accessibilityLabel="Name" placeholder="Name" />
        <Pressable accessibilityRole="button" onPress={() => {}}>
          <Text>Save name</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function AccountStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="Account" component={AccountScreen} />
    </Stack.Navigator>
  );
}
