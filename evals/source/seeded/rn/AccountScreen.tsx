import React, { useState } from 'react';
import { ScrollView, Text, TextInput, Pressable } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

const Stack = createNativeStackNavigator();

function AccountScreen() {
  const [name, setName] = useState('');
  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Text allowFontScaling={false} style={{ fontSize: 24, fontWeight: '700' }}>Account</Text>
      <TextInput value={name} onChangeText={setName} placeholder="Name" />
      <Pressable onPress={() => {}}>
        <Text>Save name</Text>
      </Pressable>
    </ScrollView>
  );
}

export function AccountStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="Account" component={AccountScreen} options={{ gestureEnabled: false }} />
    </Stack.Navigator>
  );
}
